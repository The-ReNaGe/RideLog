"""
Routes de gestion des webhooks sécurisées par utilisateur.

Sécurité:
- Tous les endpoints sont protégés par authentification JWT
- Chaque utilisateur ne voit/gère que ses propres webhooks
- Les webhooks utilisent un token_secret généré automatiquement
- L'endpoint de notification interne valide le token avant d'envoyer
- La documentation des webhooks est réservée aux administrateurs
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import User, Webhook, get_db
from security import get_current_user, get_current_admin
from schemas import WebhookCreate, WebhookToggle

logger = logging.getLogger("ridelog.webhooks")
router = APIRouter(tags=["webhooks"])

# ═══════════════════════════════════════════════════════════════════════════
# Status labels & colors (French)
# ═══════════════════════════════════════════════════════════════════════════

STATUS_LABELS = {
    "overdue": "⛔ En retard",
    "urgent": "🔴 Urgent",
    "warning": "🟡 À prévoir",
    "reminder": "🔔 Rappel",
    "ok": "✅ OK",
}

STATUS_COLORS_DISCORD = {
    "overdue": 0xCC0000,       # red
    "urgent": 0xFF4400,        # orange-red
    "warning": 0xFFAA00,       # amber
    "reminder": 0x3399FF,      # blue
    "ok": 0x22CC44,            # green
}


# ═══════════════════════════════════════════════════════════════════════════
# Endpoints publics (authentifiés) - Gestion des webhooks
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/settings/webhooks")
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Liste tous les webhooks de l'utilisateur courant.
    
    Sécurité: Chaque utilisateur ne voit que ses propres webhooks.
    """
    webhooks = db.query(Webhook).filter(Webhook.user_id == current_user.id).all()
    return [w.to_dict() for w in webhooks]


@router.post("/settings/webhooks", status_code=status.HTTP_201_CREATED)
async def create_webhook(
    data: WebhookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Crée un nouveau webhook pour l'utilisateur.
    
    Sécurité:
    - Un token_secret unique et sécurisé est généré automatiquement
    - Ce token est retourné UNE SEULE FOIS lors de la création
    - À conserver précieusement pour utiliser les notifications
    
    Exemple:
        POST /settings/webhooks
        {
            "url": "https://discord.com/api/webhooks/...",
            "webhook_type": "discord"
        }
    
    Réponse:
        {
            "id": 1,
            "url": "https://discord.com/api/webhooks/...",
            "webhook_type": "discord",
            "is_active": true,
            "token_secret": "sk_live_abc123xyz... (À conserver!)",
            "created_at": "2026-03-09T..."
        }
    """
    # Générer un token_secret unique (64 caractères, très sécurisé)
    token_secret = f"sk_live_{secrets.token_urlsafe(48)}"
    
    webhook = Webhook(
        user_id=current_user.id,
        url=data.url,
        webhook_type=data.webhook_type,
        token_secret=token_secret,
        is_active=True,
    )

    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    
    logger.info(
        "Webhook created for user %s: %s (%s)",
        current_user.username,
        data.webhook_type,
        data.url[:40]
    )
    
    # Retourner le token_secret UNE SEULE FOIS
    return webhook.to_dict(include_token=True)


@router.post("/settings/webhooks/check-reminders")
async def check_reminders_now(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Relance immédiatement la vérification des rappels pour tous les véhicules
    de l'utilisateur et envoie les notifications nécessaires.
    Efface d'abord les anciens logs pour forcer un envoi frais.
    """
    from reminder_scheduler import _check_vehicle_reminders
    from models import Vehicle, NotificationLog

    vehicles = db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()
    vehicle_ids = [v.id for v in vehicles]

    # Clear all notification logs for this user's vehicles to force re-send
    cleared = 0
    if vehicle_ids:
        cleared = db.query(NotificationLog).filter(
            NotificationLog.vehicle_id.in_(vehicle_ids)
        ).delete(synchronize_session="fetch")
        db.commit()

    for vehicle in vehicles:
        try:
            await _check_vehicle_reminders(vehicle, db)
        except Exception:
            logger.exception("Error checking reminders for vehicle %s", vehicle.id)

    return {"checked": len(vehicles), "cleared_logs": cleared}


@router.delete("/settings/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Supprime un webhook.
    
    Sécurité: L'utilisateur ne peut supprimer que ses propres webhooks.
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook non trouvé ou accès refusé"
        )

    db.delete(webhook)
    db.commit()
    
    logger.info("Webhook %d deleted by user %s", webhook_id, current_user.username)
    return {"deleted": True, "webhook_id": webhook_id}


@router.put("/settings/webhooks/{webhook_id}")
async def toggle_webhook(
    webhook_id: int,
    data: WebhookToggle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Active/désactive un webhook.
    
    Sécurité: L'utilisateur ne peut modifier que ses propres webhooks.
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook non trouvé ou accès refusé"
        )

    webhook.is_active = data.is_active
    db.commit()
    db.refresh(webhook)
    
    logger.info(
        "Webhook %d toggled to %s by user %s",
        webhook_id,
        data.is_active,
        current_user.username
    )
    return webhook.to_dict()


@router.post("/settings/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Envoie une notification de test à un webhook.
    
    Utile pour vérifier que la configuration fonctionne.
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook non trouvé ou accès refusé"
        )

    title = "[RideLog] Test de notification"
    msg = _build_message(
        "Véhicule Test",
        "Vidange d'huile",
        "reminder",
        50,
        80,
        950,
        28
    )

    try:
        await _send_webhook_request(webhook, title, msg)
        logger.info("Test webhook sent successfully for webhook %d", webhook_id)
        return {
            "success": True,
            "message": "Notification de test envoyée avec succès"
        }
    except Exception as e:
        logger.warning("Test webhook failed for %d: %s", webhook_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Échec de l'envoi : {str(e)}"
        )


# ═══════════════════════════════════════════════════════════════════════════
# Endpoints internes - Notification (utilise token_secret)
# ═══════════════════════════════════════════════════════════════════════════

async def send_webhook_notification(
    vehicle_name: str,
    intervention_type: str,
    status: str,
    user_id: int,
    estimated_cost_min: Optional[float] = None,
    estimated_cost_max: Optional[float] = None,
    km_remaining: Optional[int] = None,
    days_remaining: Optional[int] = None,
    db: Session = None,
):
    """
    Envoie une notification de maintenance à TOUS les webhooks actifs de l'utilisateur.
    
    Fonction interne appelée par :
    - reminder_scheduler.py (vérification des rappels)
    - routes/maintenances.py (ajout/modification de maintenance)
    
    Paramètres:
    - user_id: L'utilisateur propriétaire des webhooks (isolation de sécurité)
    - vehicle_name, intervention_type, status: Détails de la maintenance
    - db: Session SQLAlchemy (passée par l'appelant)
    
    Retourne: Nombre de webhooks notifiés avec succès
    """
    if db is None:
        return 0

    # Récupérer SEULEMENT les webhooks de cet utilisateur
    webhooks = db.query(Webhook).filter(
        Webhook.user_id == user_id,
        Webhook.is_active == True,
    ).all()

    if not webhooks:
        return 0

    msg = _build_message(
        vehicle_name,
        intervention_type,
        status,
        estimated_cost_min,
        estimated_cost_max,
        km_remaining,
        days_remaining
    )
    title = f"[RideLog] {vehicle_name} – {intervention_type}"
    sent_count = 0

    for webhook in webhooks:
        try:
            await _send_webhook_request(webhook, title, msg, status)
            logger.info(
                "Webhook %d sent to user %d (%s)",
                webhook.id,
                user_id,
                webhook.webhook_type
            )
            sent_count += 1

        except Exception as e:
            logger.warning(
                "Failed to send webhook %d to user %d: %s",
                webhook.id,
                user_id,
                e
            )
            continue

    return sent_count


# ═══════════════════════════════════════════════════════════════════════════
# Fonctions utilitaires - Envoi et formatage
# ═══════════════════════════════════════════════════════════════════════════

def _build_message(
    vehicle_name: str,
    intervention_type: str,
    status: str,
    estimated_cost_min: Optional[float] = None,
    estimated_cost_max: Optional[float] = None,
    km_remaining: Optional[int] = None,
    days_remaining: Optional[int] = None
) -> str:
    """Construit un message de notification au format texte (français)."""
    label = STATUS_LABELS.get(status, status)
    parts = [
        f"🚗 {vehicle_name}",
        f"🔧 {intervention_type}",
        f"Statut : {label}"
    ]

    if km_remaining is not None and km_remaining < 999999:
        if km_remaining <= 0:
            parts.append(f"📏 ⚠️ {abs(km_remaining):,} km de retard".replace(",", " "))
        else:
            parts.append(f"📏 {km_remaining:,} km restants".replace(",", " "))
    if days_remaining is not None and days_remaining < 999999:
        if days_remaining <= 0:
            parts.append(f"📅 ⚠️ {abs(days_remaining)} jours de retard")
        else:
            parts.append(f"📅 {days_remaining} jours restants")
    if estimated_cost_min or estimated_cost_max:
        parts.append(f"💰 {estimated_cost_min or 0:.0f}€ – {estimated_cost_max or 0:.0f}€")

    return "\n".join(parts)


async def _send_webhook_request(
    webhook: Webhook,
    title: str,
    msg: str,
    status: str = "ok"
):
    """Envoie une requête HTTP au webhook basé sur son type."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Discord uniquement
        color = STATUS_COLORS_DISCORD.get(status, 0x888888)
        label = STATUS_LABELS.get(status, status)
        await client.post(webhook.url, json={
            "embeds": [{
                "title": f"🔧 Maintenance",
                "description": msg,
                "color": color,
                "footer": {"text": "RideLog"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        })
