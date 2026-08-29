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

from models import User, Vehicle, Maintenance, MaintenanceInvoice, Invitation, Family, SessionLocal, get_db
from security import (
    hash_password,
    verify_password,
    create_access_token,
    verify_token,
    TokenResponse,
    TokenData,
    get_current_user,
    get_current_admin,
    get_client_ip,
    login_limiter,
    account_limiter,
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

# ─────────────────────────────────────────────────────────────────────────────
# Flag en mémoire pour activer/désactiver la réinitialisation de mot de passe
# par un admin (POST /admin/users/{id}/reset-password).
# - True  (défaut) : les admins peuvent réinitialiser un mot de passe
# - False           : l'endpoint retourne 403, même pour un admin
# Persiste en mémoire jusqu'au redémarrage du backend (même pattern que
# _ha_integration_enabled ci-dessus).
# ─────────────────────────────────────────────────────────────────────────────
_password_reset_enabled: bool = True


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
    must_change_password: bool = False
    password_reset_requested_at: str | None = None
    # None = aucune préférence exprimée. Le frontend affiche alors le français ;
    # c'est volontairement distinct de "fr" choisi explicitement (migration 011).
    language: str | None = None


class AdminCreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str | None = Field(None, min_length=6, max_length=200)
    is_admin: bool = False


class AdminCreateUserResponse(UserResponse):
    # Mot de passe généré automatiquement si l'admin n'en a pas fourni un.
    # N'est renvoyé qu'une seule fois, à la création — jamais stocké en clair,
    # jamais renvoyé par un autre endpoint (get_all_users ne l'inclut pas).
    generated_password: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(...)
    new_password: str = Field(..., min_length=6, max_length=200)


class AdminResetPasswordRequest(BaseModel):
    password: str | None = Field(None, min_length=6, max_length=200)


class AdminResetPasswordResponse(BaseModel):
    username: str
    # Mot de passe généré automatiquement si l'admin n'en a pas fourni un —
    # même politique que AdminCreateUserResponse : affiché une seule fois.
    generated_password: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
# Routes d'authentification
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    username_normalized = data.username.lower()

    if data.password != data.password_confirm:
        raise HTTPException(status_code=400, detail="Les mots de passe ne correspondent pas")

    user_count = db.query(User).count()
    is_first_user = user_count == 0

    # Le droit de s'inscrire est vérifié AVANT l'unicité de l'identifiant.
    # Dans l'ordre inverse, un appelant non authentifié distinguait un compte
    # existant (409) d'un compte inconnu (403) et pouvait donc énumérer les
    # utilisateurs de l'instance — de quoi cibler ensuite le bruteforce, et
    # déclencher le verrouillage par compte sur des identifiants valides.
    invitation = None
    if not is_first_user:
        reg_mode = app_config.REGISTRATION_MODE
        if reg_mode == 'closed':
            raise HTTPException(status_code=403, detail="Les inscriptions sont fermées")
        elif reg_mode == 'invite':
            if not data.invite_token:
                raise HTTPException(status_code=403, detail="Une invitation est requise pour créer un compte")
            invitation = db.query(Invitation).filter(
                Invitation.token == data.invite_token,
                # Une invitation de GROUPE FAMILLE ne vaut pas droit
                # d'inscription : faire entrer quelqu'un sur l'instance reste
                # réservé à un administrateur. Un lien de groupe ne sert qu'à
                # rattacher un compte DÉJÀ existant, via POST /family/join.
                #
                # Le filtre est posé dans la requête plutôt qu'en test après
                # coup pour que le refus soit indiscernable d'un jeton inconnu :
                # un message distinct apprendrait à un inconnu qu'un groupe
                # existe derrière ce jeton.
                Invitation.family_id.is_(None),
            ).first()
            if not invitation:
                raise HTTPException(status_code=403, detail="Lien d'invitation invalide")
            if invitation.used_by is not None:
                raise HTTPException(status_code=403, detail="Ce lien d'invitation a déjà été utilisé")
            from datetime import datetime
            now_utc = datetime.utcnow()
            expires = invitation.expires_at if invitation.expires_at.tzinfo is None else invitation.expires_at.replace(tzinfo=None)
            if now_utc > expires:
                raise HTTPException(status_code=403, detail="Ce lien d'invitation a expiré")

    # À ce stade l'appelant a prouvé son droit de créer un compte : lui dire que
    # l'identifiant est pris ne renseigne plus un inconnu, et reste nécessaire
    # pour qu'il en choisisse un autre.
    if db.query(User).filter(User.username == username_normalized).first():
        raise HTTPException(status_code=409, detail="Cet identifiant est déjà utilisé")

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
    client_ip = get_client_ip(request)
    username = data.username.lower()

    # Deux compteurs indépendants : par IP et par compte. Le second reste
    # efficace quand l'IP n'est pas fiable (port 8000 exposé, en-têtes
    # usurpables) ou partagée par tous les visiteurs derrière un proxy amont.
    wait = max(login_limiter.check(client_ip), account_limiter.check(username))
    if wait > 0:
        logger.warning("Login bloqué pour %s / compte %s (%ds restantes)", client_ip, username, wait)
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {wait} secondes.",
            headers={"Retry-After": str(wait)},
        )

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(data.password, user.password_hash):
        login_limiter.record_failure(client_ip)
        account_limiter.record_failure(username)
        logger.warning("Tentative de login échouée pour: %s", data.username)
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")

    login_limiter.record_success(client_ip)
    account_limiter.record_success(username)
    token = create_access_token(user.id, user.username, password_changed_at=user.password_changed_at)
    logger.info("Login réussi pour: %s", user.username)
    return token


class RequestPasswordResetRequest(BaseModel):
    username: str = Field(...)


@router.post("/auth/request-password-reset")
async def request_password_reset(
    data: RequestPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Signale à l'administrateur qu'un utilisateur a oublié son mot de passe.

    RideLog tourne offline (pas de SMTP) : il n'y a pas de lien de reset par
    email. Cet endpoint remplace ça par une simple notification visible dans
    la console admin (badge sur l'utilisateur concerné) — c'est ensuite à un
    admin de réinitialiser le mot de passe via /admin/users/{id}/reset-password.

    Sécurité :
    - Toujours une réponse générique identique, que le compte existe ou non
      (anti énumération de comptes)
    - Rate-limité par IP (même limiteur que /auth/login) contre le spam
    - Aucune authentification requise (c'est justement pour un utilisateur
      qui n'arrive plus à se connecter)
    """
    client_ip = get_client_ip(request)

    wait = login_limiter.check(client_ip)
    if wait > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {wait} secondes.",
            headers={"Retry-After": str(wait)},
        )
    login_limiter.record_failure(client_ip)

    from datetime import datetime, timezone
    user = db.query(User).filter(User.username == data.username.lower()).first()
    if user and user.username != "homeassistant":
        user.password_reset_requested_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Demande de réinitialisation de mot de passe pour: %s", user.username)

    return {"message": "Si ce compte existe, une demande a été envoyée aux administrateurs."}


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user.to_dict()


@router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user)):
    logger.info("Logout pour: %s", current_user.username)
    return {"message": "Déconnecté avec succès"}


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(current_user: User = Depends(get_current_user)):
    new_token = create_access_token(current_user.id, current_user.username, password_changed_at=current_user.password_changed_at)
    logger.info("Token renouvelé pour: %s", current_user.username)
    return new_token


class LanguageRequest(BaseModel):
    # Les langues réellement servies par le frontend. Le backend ne traduit
    # rien lui-même : il ne fait que retenir le choix et le rendre au prochain
    # démarrage, pour qu'il suive l'utilisateur d'un navigateur à l'autre.
    language: str = Field(..., pattern="^(fr|en)$")


@router.put("/auth/me/language", response_model=UserResponse)
async def set_own_language(
    data: LanguageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Langue d'interface du compte connecté.

    Réglage **par utilisateur**, contrairement au pays qui vaut pour l'instance
    entière : dans un groupe famille, un membre peut vouloir l'anglais et un
    autre le français. Le pays décrit la machine, la langue décrit la personne.
    """
    # ⚠️ `current_user` provient de get_current_user, qui ouvre SA PROPRE session
    # (security.py : `db = next(get_db_session())`). Le modifier puis committer
    # `db` ne persiste rien — la modification vit dans l'autre session. D'où la
    # re-requête, exactement comme le fait déjà change_own_password.
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user.language = data.language
    db.commit()
    db.refresh(user)
    logger.info("Langue changée en '%s' pour: %s", data.language, user.username)
    return user.to_dict()


@router.put("/auth/me/password", response_model=TokenResponse)
async def change_own_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permet à l'utilisateur connecté de changer son propre mot de passe.

    Sécurité :
    - Nécessite le mot de passe actuel (un token seul, même volé, ne suffit pas)
    - Rate-limité par IP comme /auth/login (anti brute-force sur current_password)
    - Invalide tous les tokens émis avant ce changement (password_changed_at,
      voir get_current_user) — sauf celui renvoyé ici, réémis immédiatement
      pour ne pas déconnecter l'utilisateur qui vient de faire l'opération
    """
    from datetime import datetime, timezone

    client_ip = get_client_ip(request)

    wait = login_limiter.check(client_ip)
    if wait > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {wait} secondes.",
            headers={"Retry-After": str(wait)},
        )

    if not verify_password(data.current_password, current_user.password_hash):
        login_limiter.record_failure(client_ip)
        # 400 et non 401 : l'utilisateur EST authentifié (token valide), c'est
        # juste une erreur de saisie. Un 401 ici déclencherait l'intercepteur
        # axios global (gestion "token expiré") et le déconnecterait à tort.
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    login_limiter.record_success(client_ip)

    # current_user vient de la session (séparée, déjà fermée) de get_current_user —
    # on re-requête via la session locale avant toute mutation, comme pour les
    # autres routes admin (delete_user, promote_user, admin_reset_password).
    user = db.query(User).filter(User.id == current_user.id).first()
    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    user.must_change_password = False
    db.commit()
    db.refresh(user)

    logger.info("Mot de passe changé par l'utilisateur: %s", user.username)
    return create_access_token(user.id, user.username, password_changed_at=user.password_changed_at)


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
            return create_access_token(ha_user.id, "homeassistant", expire_days=30, password_changed_at=ha_user.password_changed_at)

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
    new_token = create_access_token(user.id, user.username, expire_days=expire_days, password_changed_at=user.password_changed_at)
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


@router.post("/admin/users", response_model=AdminCreateUserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    data: AdminCreateUserRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Crée un compte utilisateur directement, sans passer par /auth/register.

    Nécessaire en mode d'inscription 'closed' ("Privé") : dans ce mode,
    /auth/register refuse toute inscription (sauf le tout premier compte),
    donc seul un admin peut créer de nouveaux comptes via cet endpoint.

    Sécurité :
    - Réservé aux admins (get_current_admin)
    - Même politique de hachage que le reste de l'app (bcrypt coût 12,
      via hash_password() — aucune différence de traitement avec /register)
    - Mot de passe généré cryptographiquement (secrets.token_urlsafe) si
      l'admin n'en fournit pas — jamais de mot de passe faible par défaut
    - Le mot de passe généré n'est renvoyé qu'une seule fois dans la réponse
      de création ; il n'est jamais journalisé ni renvoyé par un autre endpoint
    - Vérifie l'unicité du username comme /auth/register
    - Le nom "homeassistant" est réservé et ne peut pas être créé ici
    - Bloqué si REGISTRATION_MODE == 'invite' : dans ce mode, tous les comptes
      doivent passer par le flux d'invitation pour garder une trace cohérente
      (qui a invité qui). Utilisable uniquement en mode 'closed' ou 'open'.
    """
    if app_config.REGISTRATION_MODE == "invite":
        raise HTTPException(
            status_code=403,
            detail="Création manuelle désactivée en mode 'Sur invitation'. Utilisez les invitations.",
        )

    username_normalized = data.username.lower()

    if db.query(User).filter(User.username == username_normalized).first():
        raise HTTPException(status_code=409, detail="Cet identifiant est déjà utilisé")

    if username_normalized == "homeassistant":
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est réservé")

    generated_password = None
    password = data.password
    if not password:
        # Mot de passe aléatoire fort — l'admin doit le communiquer à
        # l'utilisateur par un canal sécurisé (pas email en clair, etc.)
        generated_password = secrets.token_urlsafe(12)
        password = generated_password

    try:
        password_hash = hash_password(password)
        user = User(
            username=username_normalized,
            display_name=data.display_name,
            password_hash=password_hash,
            is_admin=data.is_admin,
            # Mot de passe connu de l'admin (généré ou saisi par lui) → temporaire,
            # l'utilisateur doit le remplacer par un mot de passe à lui dès sa
            # première connexion (voir get_current_user / change_own_password).
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        logger.info(
            "Utilisateur créé manuellement par admin %s: %s%s",
            current_admin.username,
            user.username,
            " (mot de passe généré)" if generated_password else "",
        )

        result = user.to_dict()
        result["generated_password"] = generated_password
        return result

    except Exception as e:
        db.rollback()
        logger.error("Erreur création utilisateur par admin: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la création du compte")


@router.post("/admin/users/{user_id}/reset-password", response_model=AdminResetPasswordResponse)
async def admin_reset_password(
    user_id: int,
    data: AdminResetPasswordRequest,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Réinitialise le mot de passe d'un utilisateur.

    RideLog tourne offline (pas de SMTP) : il n'y a pas de flux "mot de passe
    oublié" par email. Cet endpoint est la voie de récupération — un admin
    déjà connecté réinitialise le mot de passe d'un utilisateur qui a oublié
    le sien, depuis la console admin.

    Sécurité :
    - Réservé aux admins (get_current_admin)
    - Même politique de hachage que /auth/register (bcrypt coût 12)
    - Mot de passe généré cryptographiquement (secrets.token_urlsafe) si
      l'admin n'en fournit pas — jamais de mot de passe faible par défaut
    - Le mot de passe généré n'est renvoyé qu'une seule fois dans la réponse ;
      jamais journalisé en clair, jamais renvoyé par un autre endpoint
    - Invalide immédiatement tous les tokens déjà émis pour ce compte
      (password_changed_at, voir get_current_user) : si le compte était
      compromis, l'ancien token cesse de fonctionner dès la réinitialisation
    - Le compte homeassistant est exclu : son mot de passe est aléatoire et
      n'est jamais utilisé pour se connecter (voir ha-init)
    - Peut être désactivé globalement par un admin (voir
      /admin/password-reset-status) — retourne alors 403 même pour un admin
    - Le mot de passe posé ici est temporaire (must_change_password=True) :
      l'utilisateur est forcé de le remplacer par son propre mot de passe dès
      sa prochaine connexion — l'admin ne connaît donc son mot de passe que
      le temps de le transmettre
    - Un admin ne peut PAS réinitialiser son propre mot de passe ici : ça
      invaliderait immédiatement sa propre session (password_changed_at) et
      peut le déconnecter avant qu'il ait pu noter le mot de passe généré,
      sans autre moyen de rentrer si c'est le seul admin. Utiliser
      Paramètres → Compte à la place (réémet un token, pas de déconnexion).
    """
    global _password_reset_enabled
    if not _password_reset_enabled:
        raise HTTPException(
            status_code=403,
            detail="La réinitialisation de mot de passe est désactivée par l'administrateur.",
        )

    if user_id == current_admin.id:
        raise HTTPException(
            status_code=400,
            detail="Vous ne pouvez pas réinitialiser votre propre mot de passe ici — utilisez Paramètres → Compte (vous resterez connecté).",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if user.username == "homeassistant":
        raise HTTPException(status_code=400, detail="Le mot de passe du compte Home Assistant ne peut pas être réinitialisé ici")

    generated_password = None
    password = data.password
    if not password:
        generated_password = secrets.token_urlsafe(12)
        password = generated_password

    from datetime import datetime, timezone

    try:
        user.password_hash = hash_password(password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.must_change_password = True
        user.password_reset_requested_at = None  # la demande éventuelle est traitée
        db.commit()

        logger.info(
            "Mot de passe réinitialisé par l'admin %s pour l'utilisateur %s%s",
            current_admin.username,
            user.username,
            " (mot de passe généré)" if generated_password else "",
        )

        return {"username": user.username, "generated_password": generated_password}

    except Exception as e:
        db.rollback()
        logger.error("Erreur réinitialisation mot de passe: %s", e)
        raise HTTPException(status_code=500, detail="Erreur lors de la réinitialisation du mot de passe")


@router.get("/admin/password-reset-status")
async def get_password_reset_status(
    current_admin: User = Depends(get_current_admin),
):
    """Retourne si la réinitialisation de mot de passe par un admin est activée."""
    global _password_reset_enabled
    return {"enabled": _password_reset_enabled}


class PasswordResetStatusRequest(BaseModel):
    enabled: bool


@router.put("/admin/password-reset-status")
async def set_password_reset_status(
    data: PasswordResetStatusRequest,
    current_admin: User = Depends(get_current_admin),
):
    """
    Active/désactive globalement la possibilité pour un admin de réinitialiser
    le mot de passe d'un utilisateur (POST /admin/users/{id}/reset-password).

    Utile pour restreindre cette capacité (ex: contexte multi-admin où l'on
    veut limiter qui peut y toucher, ou désactivation temporaire volontaire).
    """
    global _password_reset_enabled
    _password_reset_enabled = data.enabled
    logger.info(
        "Réinitialisation de mot de passe %s par %s",
        "activée" if data.enabled else "désactivée",
        current_admin.username,
    )
    return {"enabled": _password_reset_enabled}


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

    payload = {"valid": True, "expires_at": invitation.expires_at.isoformat()}

    # Lien de groupe famille : le nom permet à la page d'inscription d'annoncer
    # ce que l'invité rejoint, plutôt que de le rattacher en silence.
    if invitation.family_id is not None:
        family = db.query(Family).filter(Family.id == invitation.family_id).first()
        payload["family"] = {"id": family.id, "name": family.name} if family else None

    return payload


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