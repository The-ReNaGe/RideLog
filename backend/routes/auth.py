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
from pydantic import BaseModel, EmailStr, Field
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


# ═══════════════════════════════════════════════════════════════════════════
# Schémas Pydantic
# ═══════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    """Schéma pour la création d'un compte."""
    username: str = Field(..., min_length=3, max_length=50, description="Identifiant unique")
    display_name: str = Field(..., min_length=1, max_length=100, description="Nom affiché dans l'app")
    password: str = Field(..., min_length=6, description="Au moins 6 caractères")
    password_confirm: str = Field(..., description="Doit correspondre avec password")
    invite_token: str | None = Field(None, description="Token d'invitation (requis sauf premier compte)")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "toto",
                "display_name": "Toto Dupont",
                "password": "MonMotDePasse123",
                "password_confirm": "MonMotDePasse123",
                "invite_token": "abc123..."
            }
        }


class LoginRequest(BaseModel):
    """Schéma pour le login."""
    username: str = Field(..., description="Nom d'utilisateur")
    password: str = Field(..., description="Mot de passe")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "toto",
                "password": "MonMotDePasse123"
            }
        }


class UserResponse(BaseModel):
    """Réponse utilisateur (sans données sensibles)."""
    id: int
    username: str
    display_name: str
    is_admin: bool
    created_at: str


# ═══════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Crée un nouvel utilisateur local.
    
    Sécurité:
    - Vérifie les dupliquatas (username, email)
    - Valide les correspondances de mot de passe
    - Hache le mot de passe avant stockage
    - Pas d'exposition des erreurs de détail
    """
    # Normalise le username en minuscules (case-insensitive)
    username_normalized = data.username.lower()
    
    # Valide la saisie
    if data.password != data.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les mots de passe ne correspondent pas"
        )

    # Vérifie les doublons
    if db.query(User).filter(User.username == username_normalized).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cet identifiant est déjà utilisé"
        )

    # Vérifie si c'est le premier utilisateur
    user_count = db.query(User).count()
    is_first_user = user_count == 0

    # Applique la politique d'inscription
    invitation = None
    if not is_first_user:
        reg_mode = app_config.REGISTRATION_MODE
        if reg_mode == 'closed':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Les inscriptions sont fermées"
            )
        elif reg_mode == 'invite':
            if not data.invite_token:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Une invitation est requise pour créer un compte"
                )
            invitation = db.query(Invitation).filter(
                Invitation.token == data.invite_token
            ).first()
            if not invitation:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Lien d'invitation invalide"
                )
            if invitation.used_by is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Ce lien d'invitation a déjà été utilisé"
                )
            from datetime import datetime, timezone
            now_utc = datetime.utcnow()
            expires = invitation.expires_at if invitation.expires_at.tzinfo is None else invitation.expires_at.replace(tzinfo=None)
            if now_utc > expires:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Ce lien d'invitation a expiré"
                )
        # mode 'open': pas de vérification

    try:
        # Hache le mot de passe
        password_hash = hash_password(data.password)

        # Crée l'utilisateur
        user = User(
            username=username_normalized,  # Stocké en minuscules
            display_name=data.display_name,
            password_hash=password_hash,
            is_admin=is_first_user  # Le premier user est automatiquement admin
        )
        db.add(user)
        db.flush()  # Get user.id before commit

        # Marque l'invitation comme utilisée
        if invitation:
            invitation.used_by = user.id
            invitation.used_at = datetime.utcnow()

        db.commit()
        db.refresh(user)

        if is_first_user:
            logger.info(f"Premier utilisateur créé (ADMIN): {user.username}")
        else:
            logger.info(f"Nouvel utilisateur créé: {user.username}")

        return user.to_dict()

    except Exception as e:
        db.rollback()
        logger.error(f"Erreur lors de la création de l'utilisateur: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la création du compte"
        )


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Authentifie un utilisateur et retourne un JWT token.
    
    Protection anti brute-force :
    - 3 échecs  → 30 s de blocage
    - 6 échecs  → 5 min
    - 9 échecs  → 15 min
    - 12+ échecs → 1 h
    Un login réussi réinitialise le compteur.
    """
    # Détermine l'IP (derrière reverse proxy → X-Forwarded-For)
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or request.client.host

    # Vérifie le rate-limit
    wait = login_limiter.check(client_ip)
    if wait > 0:
        logger.warning(f"Login bloqué pour {client_ip} ({wait}s restantes)")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Trop de tentatives. Réessayez dans {wait} secondes.",
            headers={"Retry-After": str(wait)},
        )

    # Cherche l'utilisateur par username (normalisé en minuscules)
    user = db.query(User).filter(User.username == data.username.lower()).first()

    if not user:
        login_limiter.record_failure(client_ip)
        logger.warning(f"Tentative de login avec username inconnu: {data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiant ou mot de passe incorrect"
        )

    # Vérifie le mot de passe (timing-safe avec bcrypt)
    if not verify_password(data.password, user.password_hash):
        login_limiter.record_failure(client_ip)
        logger.warning(f"Tentative de login échouée pour: {user.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiant ou mot de passe incorrect"
        )

    # Login réussi — réinitialise le compteur
    login_limiter.record_success(client_ip)

    # Génère le token JWT
    token = create_access_token(user.id, user.username)
    logger.info(f"Login réussi pour: {user.username}")

    return token


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """
    Retourne les informations de l'utilisateur connecté.
    
    Requires: Bearer token dans Authorization header
    """
    return current_user.to_dict()


@router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Endpoint de logout (côté client: supprimer le token du localStorage).
    
    Avec les JWT, il n'y a pas de session côté serveur à supprimer.
    Le client supprime simplement son token du localStorage.
    
    Pour une vraie blacklist, implémenter Redis avec les tokens révoqués.
    """
    logger.info(f"Logout pour: {current_user.username}")
    return {
        "message": "Déconnecté avec succès",
        "instruction": "Supprimez le token du localStorage côté client"
    }


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: User = Depends(get_current_user),
):
    """
    Renouvelle le token JWT de l'utilisateur connecté.
    
    Utile pour:
    - Home Assistant qui veut garder l'accès sans changer le token manuellement
    - Automations qui renouvellent le token automatiquement chaque semaine
    
    Requires: Bearer token valide (même expiré) dans Authorization header
    
    Returns: Nouveau token valide 7 jours
    """
    new_token = create_access_token(current_user.id, current_user.username)
    logger.info(f"Token renouvelé pour: {current_user.username}")
    return new_token


@router.post("/auth/ha-init", response_model=TokenResponse)
async def init_home_assistant(
    init_key: str = Query(None, description="Clé d'initialisation secrète"),
    db: Session = Depends(get_db)
):
    """
    Initialise le compte Home Assistant Integration.
    
    Appelé par le config flow de Home Assistant lors de la création de l'intégration.
    
    ⚠️ SÉCURITÉ : HA_INIT_KEY est REQUISE. Si non définie, l'endpoint est désactivé.
    
    - Crée le compte 'homeassistant' s'il n'existe pas
    - Retourne un token Bearer valide 30 jours
    - Le compte a accès à TOUS les véhicules de tous les utilisateurs
    
    Query Parameters:
    - init_key: Clé secrète (HA_INIT_KEY doit être configurée)
    
    Returns: Token Bearer + metadata
    """
    
    # HA_INIT_KEY est OBLIGATOIRE — sans elle, l'endpoint est désactivé
    if not HA_INIT_KEY:
        logger.error("Endpoint /auth/ha-init appelé mais HA_INIT_KEY n'est pas définie")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Intégration HA non configurée. Définissez HA_INIT_KEY dans les variables d'environnement."
        )
    
    # Comparaison timing-safe pour éviter les attaques par analyse temporelle
    if not init_key or not hmac.compare_digest(init_key, HA_INIT_KEY):
        logger.warning("Tentative d'accès à /auth/ha-init avec clé invalide ou manquante")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clé d'initialisation invalide ou manquante"
        )
    
    try:
        # Vérifie si le compte existe déjà
        ha_user = db.query(User).filter(User.username == 'homeassistant').first()
        
        if ha_user:
            # Compte existe : génère juste un nouveau token
            logger.info("Compte Home Assistant existe déjà, génération d'un nouveau token")
            token = create_access_token(ha_user.id, 'homeassistant', expire_days=30)
            return token
        
        # Crée le compte avec un password aléatoire (jamais utilisé)
        ha_password = secrets.token_urlsafe(32)
        ha_password_hash = hash_password(ha_password)
        
        ha_user = User(
            username='homeassistant',
            display_name='Home Assistant Integration',
            password_hash=ha_password_hash,
            is_admin=False,  # Pas admin, juste accès à tous les véhicules
            is_integration_account=True  # Flag spécial pour les intégrations
        )
        db.add(ha_user)
        db.commit()
        db.refresh(ha_user)
        
        # Génère le token valide 30 jours
        token = create_access_token(ha_user.id, 'homeassistant', expire_days=30)
        
        logger.info(f"Compte Home Assistant créé avec succès: {ha_user.username}")
        
        return token
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        db.rollback()
        logger.error(f"Erreur lors de l'initialisation HA: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la création du compte Home Assistant"
        )


@router.post("/auth/refresh-token", response_model=TokenResponse)
async def refresh_token(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """
    Rafraîchit un token JWT valide.
    
    Utilisé par l'intégration Home Assistant pour renouveler le token avant expiration.
    
    - Accepte le token actuel via Authorization header
    - Retourne un nouveau token valide 30 jours
    - Si le token est expiré, retourne une erreur
    
    Header:
    - Authorization: Bearer <token>
    
    Returns: Nouveau token Bearer
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant"
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Schéma invalide")
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Format de token invalide"
        )
    
    # Valide le token
    from security import verify_token
    token_data = verify_token(token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré"
        )
    
    try:
        # Récupère l'utilisateur
        user = db.query(User).filter(User.id == token_data.user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur non trouvé"
            )
        
        # Seuls les comptes d'intégration obtiennent des tokens 30 jours
        expire_days = 30 if user.is_integration_account else 7
        new_token = create_access_token(user.id, user.username, expire_days=expire_days)
        
        logger.info(f"Token rafraîchi pour {user.username} ({expire_days}j)")
        
        return new_token
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors du refresh du token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du rafraîchissement du token"
        )


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/admin/users", response_model=list[UserResponse])
async def get_all_users(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Lister tous les utilisateurs (admin seulement).
    """
    users = db.query(User).all()
    return [u.to_dict() for u in users]


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Supprimer un utilisateur (admin seulement).
    
    Sécurité:
    - L'admin ne peut pas se supprimer lui-même
    - Suppression en cascade des véhicules et maintenances de l'user
    """
    # Empêche auto-suppression
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas supprimer votre propre compte"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )

    # Empêche la suppression d'un admin
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Les administrateurs ne peuvent pas être supprimés. Rétrogradez-le d'abord."
        )

    # Clean up all files before cascade delete
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
        logger.info(f"Utilisateur supprimé par {current_admin.username}: {user.username}")
        return {
            "message": f"Utilisateur {user.username} supprimé avec succès",
            "deleted_user_id": user_id
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Erreur lors de la suppression: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la suppression"
        )


@router.put("/admin/users/{user_id}/promote")
async def promote_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Promouvoir/rétrograder un utilisateur (admin seulement).
    
    Endpoint togglable : passer is_admin de False à True ou True à False.
    
    ⚠️ Protection : Le compte 'homeassistant' ne peut pas être promu en admin.
    """
    # Empêche auto-modification
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas modifier votre propre statut admin"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )

    # Empêche la promotion du compte homeassistant en admin
    if user.username == 'homeassistant':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Le compte Home Assistant est un service account et ne peut pas être promu en administrateur"
        )

    try:
        old_status = user.is_admin
        user.is_admin = not user.is_admin  # Toggle
        db.commit()
        db.refresh(user)
        
        action = "promu administrateur" if user.is_admin else "rétrogradé utilisateur"
        logger.info(f"Utilisateur {user.username} {action} par {current_admin.username}")
        
        return {
            "message": f"Utilisateur {user.username} {action}",
            "user_id": user_id,
            "is_admin": user.is_admin,
            "previous_status": old_status
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Erreur lors de la modification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la modification du statut"
        )


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES INVITATIONS
# ═══════════════════════════════════════════════════════════════════════════

class CreateInvitationRequest(BaseModel):
    """Schéma pour créer une invitation."""
    expires_hours: int = Field(default=48, ge=1, le=720, description="Durée de validité en heures (1-720)")


@router.post("/admin/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    data: CreateInvitationRequest = CreateInvitationRequest(),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Créer un lien d'invitation (admin seulement)."""
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
    
    logger.info(f"Invitation créée par {current_admin.username} (expire dans {data.expires_hours}h)")
    return invitation.to_dict()


@router.get("/admin/invitations")
async def list_invitations(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lister toutes les invitations (admin seulement)."""
    invitations = db.query(Invitation).order_by(Invitation.created_at.desc()).all()
    return [inv.to_dict() for inv in invitations]


@router.delete("/admin/invitations/{invitation_id}")
async def delete_invitation(
    invitation_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Supprimer/révoquer une invitation (admin seulement)."""
    invitation = db.query(Invitation).filter(Invitation.id == invitation_id).first()
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation non trouvée"
        )
    
    db.delete(invitation)
    db.commit()
    logger.info(f"Invitation {invitation_id} supprimée par {current_admin.username}")
    return {"message": "Invitation supprimée"}


@router.get("/auth/check-invite/{token}")
async def check_invitation(token: str, db: Session = Depends(get_db)):
    """Vérifie si un token d'invitation est valide (endpoint public)."""
    from datetime import datetime
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation invalide")
    if invitation.used_by is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation déjà utilisée")
    now_utc = datetime.utcnow()
    expires = invitation.expires_at if invitation.expires_at.tzinfo is None else invitation.expires_at.replace(tzinfo=None)
    if now_utc > expires:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expirée")
    return {"valid": True, "expires_at": invitation.expires_at.isoformat()}


@router.get("/auth/registration-status")
async def registration_status(db: Session = Depends(get_db)):
    """Retourne le mode d'inscription actuel."""
    user_count = db.query(User).count()
    return {
        "mode": app_config.REGISTRATION_MODE if user_count > 0 else "open",
        "is_first_user": user_count == 0,
    }


@router.get("/admin/registration-mode")
async def get_registration_mode(
    current_admin: User = Depends(get_current_admin),
):
    """Retourne le mode d'inscription actuel (admin)."""
    return {"mode": app_config.REGISTRATION_MODE}


class RegistrationModeRequest(BaseModel):
    mode: str = Field(..., pattern="^(invite|open|closed)$")


@router.put("/admin/registration-mode")
async def set_registration_mode(
    data: RegistrationModeRequest,
    current_admin: User = Depends(get_current_admin),
):
    """Change le mode d'inscription (admin). Modifie la variable globale en mémoire."""
    app_config.REGISTRATION_MODE = data.mode
    logger.info(f"Mode d'inscription changé en '{data.mode}' par {current_admin.username}")
    return {"mode": data.mode}



