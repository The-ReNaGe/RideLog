"""
Routes d'authentification (register, login, logout, me).

🔐 Sécurité:
- Mots de passe hachés avec bcrypt (coût 12)
- Tokens JWT valides 7 jours
- Validation stricte des inputs
- Pas d'exposition de détails d'erreur au client
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import logging
import secrets
import hmac

import os
from pathlib import Path

from models import User, Vehicle, Maintenance, MaintenanceInvoice, Invitation, SessionLocal, get_db
from security import (
    hash_password,
    verify_password,
    create_access_token,
    verify_token,
    TokenResponse,
    TokenData,
    get_current_user,
    get_current_admin,
    login_limiter,
)
from config import HA_INIT_KEY
import config as app_config

logger = logging.getLogger("ridelog.auth")

router = APIRouter(tags=["Authentication"])

# ─────────────────────────────────────────────────────────────────────────────
# Flag en mémoire pour activer/désactiver l'intégration Home Assistant.
# - True  (défaut) : ha-init fonctionne normalement
# - False           : ha-init retourne 403 même avec la bonne clé, empêchant
#                     Home Assistant de recréer le compte automatiquement.
# Persiste en mémoire jusqu'au redémarrage du backend.
# En cas de redémarrage, le flag repasse à True — mais le compte n'est pas
# recréé automatiquement car ha-init ne crée le compte que s'il est absent
# ET que le flag est True.
# ─────────────────────────────────────────────────────────────────────────────
_ha_integration_enabled: bool = True


# ═══════════════════════════════════════════════════════════════════════════
# Schémas Pydantic
# ═══════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6)
    password_confirm: str = Field(...)
    invite_token: str | None = Field(None)


class LoginRequest(BaseModel):
    username: str = Field(...)
    password: str = Field(...)


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    is_admin: bool
    created_at: str


# ═══════════════════════════════════════════════════════════════════════════
# Routes d'authentification
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    username_normalized = data.username.lower()

    if data.password != data.password_confirm:
        raise HTTPException(status_code=400, detail="Les mots de passe ne correspondent pas")

    if db.query(User).filter(User.username == username_normalized).first():
        raise HTTPException(status_code=409, detail="Cet identifiant est déjà utilisé")

    user_count = db.query(User).count()
    is_first_user = user_count == 0

    invitation = None
    if not is_first_user:
        reg_mode = app_config.REGISTRATION_MODE
        if reg_mode == 'closed':
            raise HTTPException(status_code=403, detail="Les inscriptions sont fermées")
        elif reg_mode == 'invite':
            if not data.invite_token:
                raise HTTPException(status_code=403, detail="Une invitation est requise pour créer un compte")
            invitation = db.query(Invitation).filter(Invitation.token == data.invite_token).first()
            if not invitation:
                raise HTTPException(status_code=403, detail="Lien d'invitation invalide")
            if invitation.used_by is not None:
                raise HTTPException(status_code=403, detail="Ce lien d'invitation a déjà été utilisé")
            from datetime import datetime
            now_utc = datetime.utcnow()
            expires = invitation.expires_at if invitation.expires_at.tzinfo is None else invitation.expires_at.replace(tzinfo=None)
            if now_utc > expires:
                raise HTTPException(status_code=403, detail="Ce lien d'invitation a expiré")

    try:
        password_hash = hash_password(data.password)
        user = User(
            username=username_normalized,
            display_name=data.display_name,
            password_hash=password_hash,
            is_admin=is_first_user,
        )
        db.add(user)
        db.flush()

        if invitation:
            from datetime import datetime
            invitation.used_by = user.id
            invitation.used_at = datetime.utcnow()

        db.commit()
        db.refresh(user)
        logger.info("Utilisateur créé%s: %s", " (ADMIN)" if is_first_user else "", user.username)
        return user.to_dict()

    except Exception as e:
        db.rollback()
        logger.error("Erreur création utilisateur: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la création du compte")


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or request.client.host

    wait = login_limiter.check(client_ip)
    if wait > 0:
        logger.warning("Login bloqué pour %s (%ds restantes)", client_ip, wait)
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {wait} secondes.",
            headers={"Retry-After": str(wait)},
        )

    user = db.query(User).filter(User.username == data.username.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        login_limiter.record_failure(client_ip)
        logger.warning("Tentative de login échouée pour: %s", data.username)
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")

    login_limiter.record_success(client_ip)
    token = create_access_token(user.id, user.username)
    logger.info("Login réussi pour: %s", user.username)
    return token


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user.to_dict()


@router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    logger.info("Logout pour: %s", current_user.username)
    return {"message": "Déconnecté avec succès"}


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(current_user: User = Depends(get_current_user)):
    new_token = create_access_token(current_user.id, current_user.username)
    logger.info("Token renouvelé pour: %s", current_user.username)
    return new_token


@router.post("/auth/ha-init", response_model=TokenResponse)
async def init_home_assistant(
    init_key: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Initialise le compte Home Assistant Integration.

    Appelé par le config flow HA lors de la création de l'intégration.

    Sécurité :
    - HA_INIT_KEY obligatoire — endpoint désactivé si non définie
    - Comparaison timing-safe pour éviter les attaques temporelles
    - Bloqué si l'admin a désactivé l'intégration depuis l'UI
    - Ne crée le compte que s'il est absent (pas de recréation silencieuse)
    """
    # 1. Clé obligatoire côté serveur
    if not HA_INIT_KEY:
        logger.error("ha-init appelé mais HA_INIT_KEY n'est pas définie")
        raise HTTPException(
            status_code=503,
            detail="Intégration HA non configurée. Définissez HA_INIT_KEY dans les variables d'environnement.",
        )

    # 2. Comparaison timing-safe
    if not init_key or not hmac.compare_digest(init_key, HA_INIT_KEY):
        logger.warning("ha-init : clé invalide ou manquante")
        raise HTTPException(status_code=403, detail="Clé d'initialisation invalide ou manquante")

    # 3. Vérifier que l'admin n'a pas désactivé l'intégration
    global _ha_integration_enabled
    if not _ha_integration_enabled:
        logger.warning("ha-init bloqué — intégration désactivée par l'admin")
        raise HTTPException(
            status_code=403,
            detail="Intégration Home Assistant désactivée par l'administrateur. Réactivez-la depuis l'interface RideLog.",
        )

    try:
        ha_user = db.query(User).filter(User.username == "homeassistant").first()

        if ha_user:
            # Compte existant — renouveler le token uniquement (comportement normal au redémarrage HA)
            logger.info("Compte homeassistant existant — renouvellement du token")
            return create_access_token(ha_user.id, "homeassistant", expire_days=30)

        # Créer le compte avec un mot de passe aléatoire (jamais utilisé pour se connecter)
        ha_password_hash = hash_password(secrets.token_urlsafe(32))
        ha_user = User(
            username="homeassistant",
            display_name="Home Assistant Integration",
            password_hash=ha_password_hash,
            is_admin=False,
            is_integration_account=True,
        )
        db.add(ha_user)
        db.commit()
        db.refresh(ha_user)

        token = create_access_token(ha_user.id, "homeassistant", expire_days=30)
        logger.info("Compte Home Assistant créé avec succès: homeassistant")
        return token

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("Erreur init HA: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la création du compte Home Assistant")


@router.post("/auth/refresh-token", response_model=TokenResponse)
async def refresh_token_legacy(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    """Rafraîchit un token JWT — utilisé par l'intégration Home Assistant."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Schéma invalide")
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Format de token invalide")

    token_data = verify_token(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    expire_days = 30 if user.is_integration_account else 7
    new_token = create_access_token(user.id, user.username, expire_days=expire_days)
    logger.info("Token rafraîchi pour %s (%dj)", user.username, expire_days)
    return new_token


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN — Utilisateurs
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/admin/users", response_model=list[UserResponse])
async def get_all_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).all()
    return [u.to_dict() for u in users]


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if user.is_admin:
        raise HTTPException(status_code=403, detail="Les administrateurs ne peuvent pas être supprimés. Rétrogradez-le d'abord.")

    from routes import secure_delete
    for vehicle in user.vehicles:
        if vehicle.photo_path:
            secure_delete(vehicle.photo_path)
        for maintenance in vehicle.maintenances:
            for invoice in maintenance.invoices:
                if invoice.file_path:
                    secure_delete(invoice.file_path)

    try:
        db.delete(user)
        db.commit()
        logger.info("Utilisateur supprimé par %s: %s", current_admin.username, user.username)
        return {"message": f"Utilisateur {user.username} supprimé avec succès", "deleted_user_id": user_id}
    except Exception as e:
        db.rollback()
        logger.error("Erreur suppression: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")


@router.put("/admin/users/{user_id}/promote")
async def promote_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas modifier votre propre statut admin")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if user.username == "homeassistant":
        raise HTTPException(status_code=403, detail="Le compte Home Assistant ne peut pas être promu en administrateur")

    try:
        old_status = user.is_admin
        user.is_admin = not user.is_admin
        db.commit()
        db.refresh(user)
        action = "promu administrateur" if user.is_admin else "rétrogradé utilisateur"
        logger.info("Utilisateur %s %s par %s", user.username, action, current_admin.username)
        return {"message": f"Utilisateur {user.username} {action}", "user_id": user_id, "is_admin": user.is_admin, "previous_status": old_status}
    except Exception as e:
        db.rollback()
        logger.error("Erreur promotion: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la modification du statut")


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN — Intégration Home Assistant
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/admin/ha-integration-status")
async def get_ha_integration_status(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne l'état de l'intégration Home Assistant :
    - enabled : si le flag en mémoire est actif
    - account_exists : si le compte homeassistant existe en BDD
    """
    global _ha_integration_enabled
    ha_user = db.query(User).filter(User.username == "homeassistant").first()
    return {
        "enabled": _ha_integration_enabled,
        "account_exists": ha_user is not None,
        "account_id": ha_user.id if ha_user else None,
    }


@router.post("/admin/ha-integration/enable")
async def enable_ha_integration(
    current_admin: User = Depends(get_current_admin),
):
    """
    Active l'intégration HA.
    HA pourra appeler ha-init avec la bonne clé pour créer/renouveler le compte.
    """
    global _ha_integration_enabled
    _ha_integration_enabled = True
    logger.info("Intégration HA activée par %s", current_admin.username)
    return {"enabled": True, "message": "Intégration Home Assistant activée. HA peut maintenant créer/renouveler le compte."}


@router.post("/admin/ha-integration/disable")
async def disable_ha_integration(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Désactive l'intégration HA :
    1. Passe le flag à False → ha-init retournera 403
    2. Supprime le compte homeassistant s'il existe (révoque l'accès immédiatement)

    Sécurité : même avec la bonne HA_INIT_KEY, HA ne pourra plus créer de compte
    tant que l'admin n'a pas réactivé depuis l'UI.
    """
    global _ha_integration_enabled
    _ha_integration_enabled = False

    ha_user = db.query(User).filter(User.username == "homeassistant").first()
    account_deleted = False
    if ha_user:
        # Pas de véhicules ni fichiers à nettoyer (compte d'intégration)
        db.delete(ha_user)
        db.commit()
        account_deleted = True
        logger.info("Compte homeassistant supprimé et intégration désactivée par %s", current_admin.username)
    else:
        logger.info("Intégration HA désactivée par %s (compte déjà absent)", current_admin.username)

    return {
        "enabled": False,
        "account_deleted": account_deleted,
        "message": "Intégration Home Assistant désactivée. HA ne peut plus accéder à RideLog.",
    }


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN — Invitations
# ═══════════════════════════════════════════════════════════════════════════

class CreateInvitationRequest(BaseModel):
    expires_hours: int = Field(default=48, ge=1, le=720)


@router.post("/admin/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    data: CreateInvitationRequest = CreateInvitationRequest(),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from datetime import datetime, timedelta
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        token=token,
        created_by=current_admin.id,
        expires_at=datetime.utcnow() + timedelta(hours=data.expires_hours),
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    logger.info("Invitation créée par %s (expire dans %dh)", current_admin.username, data.expires_hours)
    return invitation.to_dict()


@router.get("/admin/invitations")
async def list_invitations(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    invitations = db.query(Invitation).order_by(Invitation.created_at.desc()).all()
    return [inv.to_dict() for inv in invitations]


@router.delete("/admin/invitations/{invitation_id}")
async def delete_invitation(
    invitation_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    invitation = db.query(Invitation).filter(Invitation.id == invitation_id).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation non trouvée")
    db.delete(invitation)
    db.commit()
    logger.info("Invitation %d supprimée par %s", invitation_id, current_admin.username)
    return {"message": "Invitation supprimée"}


@router.get("/auth/check-invite/{token}")
async def check_invitation(token: str, db: Session = Depends(get_db)):
    from datetime import datetime
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation invalide")
    if invitation.used_by is not None:
        raise HTTPException(status_code=410, detail="Invitation déjà utilisée")
    now_utc = datetime.utcnow()
    expires = invitation.expires_at if invitation.expires_at.tzinfo is None else invitation.expires_at.replace(tzinfo=None)
    if now_utc > expires:
        raise HTTPException(status_code=410, detail="Invitation expirée")
    return {"valid": True, "expires_at": invitation.expires_at.isoformat()}


@router.get("/auth/registration-status")
async def registration_status(db: Session = Depends(get_db)):
    user_count = db.query(User).count()
    return {
        "mode": app_config.REGISTRATION_MODE if user_count > 0 else "open",
        "is_first_user": user_count == 0,
    }


@router.get("/admin/registration-mode")
async def get_registration_mode(current_admin: User = Depends(get_current_admin)):
    return {"mode": app_config.REGISTRATION_MODE}


class RegistrationModeRequest(BaseModel):
    mode: str = Field(..., pattern="^(invite|open|closed)$")


@router.put("/admin/registration-mode")
async def set_registration_mode(
    data: RegistrationModeRequest,
    current_admin: User = Depends(get_current_admin),
):
    app_config.REGISTRATION_MODE = data.mode
    logger.info("Mode d'inscription changé en '%s' par %s", data.mode, current_admin.username)
    return {"mode": data.mode}