"""
Sécurité et gestion d'authentification.
- Hachage bcrypt des mots de passe
- Génération/validation de tokens JWT

VARIABLES D'ENVIRONNEMENT UTILISÉES:
====================================

JWT_SECRET (env var: JWT_SECRET)
  - Description: Clé secrète pour signer les tokens JWT avec l'algorithme HS256
  - Valeur par défaut: "dev-secret-change-in-production-🔐" (UNSECURE - dev only!)
  - Production: MUST be set via environment variable (minimum 32 caractères aléatoires)
  - Génération sécurisée: python -c "import secrets; print(secrets.token_urlsafe(32))"
  - Approche: Lire depuis .env via docker-compose.yml
  - Impact: Si changé, tous les tokens JWT existants deviennent invalides
  - Stockage: JAMAIS en dur dans le code, TOUJOURS via variable d'environnement
  
Exemples d'utilisation:
  - DEV:  JWT_SECRET est défini dans .env (local development)
  - PROD: JWT_SECRET est injecté via secrets manager / env variable

Flow:
  1. Docker démarre avec -e JWT_SECRET=<valeur>
  2. os.getenv("JWT_SECRET") récupère la valeur
  3. Cette clé est utilisée pour:
     - Signer les tokens JWT lors du login (jwt.encode)
     - Vérifier la signature des tokens lors des requêtes (jwt.decode)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, TYPE_CHECKING
import ipaddress
import logging
import os

import bcrypt
import jwt
from pydantic import BaseModel
from fastapi import HTTPException, Header, Depends, status, Request
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from models import User

logger = logging.getLogger("ridelog.security")


# ═══════════════════════════════════════════════════════════════════════════
# Configuration - VARIABLES D'ENVIRONNEMENT
# ═══════════════════════════════════════════════════════════════════════════

# JWT_SECRET: Clé pour signer les tokens (HMAC-SHA256)
# - Définie dans .env et passée par docker-compose.yml
# - Ne JAMAIS hardcoder en production
DEFAULT_JWT_SECRET = "dev-secret-change-in-production-🔐"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)

# Valeurs refusées au démarrage : toutes lisibles dans le dépôt public, donc
# équivalentes à une absence de secret. Le placeholder de .env.example en fait
# partie — c'est la valeur qu'obtient quiconque copie le fichier sans le remplir.
KNOWN_PUBLIC_JWT_SECRETS = {
    DEFAULT_JWT_SECRET,
    "changez-moi-en-production",
    "change-me-in-production",
}

# Longueur en dessous de laquelle on avertit (sans bloquer) : un secret court
# reste bruteforçable hors ligne à partir d'un seul token intercepté.
MIN_JWT_SECRET_LENGTH = 32


def validate_jwt_secret() -> None:
    """
    Refuse de démarrer si JWT_SECRET est resté sur une valeur publique.

    Ces valeurs sont lisibles dans le dépôt : une instance qui démarre avec
    l'une d'elles signe ses tokens avec un secret connu de tous. N'importe qui
    peut alors forger un JWT ``{"user_id": 1, ...}`` et obtenir un accès admin
    sans jamais toucher au mot de passe — le rate limiting du login n'y peut
    rien, puisqu'il n'y a pas de login.

    Appelée au démarrage (main.py, lifespan) pour transformer une compromission
    silencieuse en erreur explicite au premier ``docker compose up``.
    """
    if not JWT_SECRET or JWT_SECRET in KNOWN_PUBLIC_JWT_SECRETS:
        raise RuntimeError(
            "JWT_SECRET n'est pas configuré (valeur publique détectée).\n"
            "Cette valeur est publique : démarrer avec elle permettrait à "
            "n'importe qui de forger un token administrateur.\n"
            "Générez-en un puis placez-le dans votre fichier .env :\n"
            "  python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )

    if len(JWT_SECRET) < MIN_JWT_SECRET_LENGTH:
        logger.warning(
            "JWT_SECRET fait %d caractères (minimum recommandé : %d). "
            "Un secret court est bruteforçable hors ligne à partir d'un seul token.",
            len(JWT_SECRET), MIN_JWT_SECRET_LENGTH,
        )

# JWT_ALGORITHM: Algorithme de signature (HMAC avec SHA-256)
JWT_ALGORITHM = "HS256"

# JWT_EXPIRE_DAYS: Durée de validité des tokens
JWT_EXPIRE_DAYS = 7  # Token valide 7 jours


# ═══════════════════════════════════════════════════════════════════════════
# Schémas Pydantic pour tokens
# ═══════════════════════════════════════════════════════════════════════════

class TokenData(BaseModel):
    """Données encodées dans le JWT token."""
    user_id: int
    username: str
    exp: int
    pwd_ts: int = 0  # Timestamp de password_changed_at au moment de l'émission (voir get_current_user)


class TokenResponse(BaseModel):
    """Réponse de login contenant le token."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # Secondes


# ═══════════════════════════════════════════════════════════════════════════
# Fonctions de hachage (bcrypt)
# ═══════════════════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    """
    Hache un mot de passe avec bcrypt (coût: 12).
    
    Sécurité:
    - Chaque appel génère un salt aléatoire
    - Coût 12 = ~100ms (équilibre sécurité/perf)
    - Résistant aux attaques par force brute
    """
    if not password or len(password) < 6:
        raise ValueError("Le mot de passe doit faire au moins 6 caractères")
    
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """
    Vérifie qu'un mot de passe correspond à son hash bcrypt.
    
    Timing-safe: La vérification prend toujours le même temps
    (prévient les attaques par analyse temporelle).
    """
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════════════════
# Fonctions JWT
# ═══════════════════════════════════════════════════════════════════════════

def create_access_token(
    user_id: int,
    username: str,
    expire_days: Optional[int] = None,
    password_changed_at: Optional[datetime] = None,
) -> TokenResponse:
    """
    Crée un JWT token d'accès.

    Sécurité du token:
    - Algorithme: HS256 (HMAC-SHA256)
    - Secret: Défini dans JWT_SECRET
    - Expiration: Configurable (par défaut 7 jours)
    - Payload: user_id, username, exp, pwd_ts

    Le token contient tout ce qui est nécessaire pour identifier l'utilisateur
    (pas de stockage de session côté serveur).

    Args:
        user_id: ID de l'utilisateur
        username: Nom d'utilisateur
        expire_days: Jours de validité (défaut: JWT_EXPIRE_DAYS = 7)
        password_changed_at: Horodatage du dernier changement de mot de passe
            de l'utilisateur — embarqué dans le token (pwd_ts) et comparé à
            chaque requête (get_current_user) pour invalider tout token émis
            AVANT un reset/changement de mot de passe.
    """
    if expire_days is None:
        expire_days = JWT_EXPIRE_DAYS

    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=expire_days)

    payload = {
        "user_id": user_id,
        "username": username,
        "exp": int(expire.timestamp()),  # Unix timestamp
        "iat": int(now.timestamp()),
        "pwd_ts": int(password_changed_at.timestamp()) if password_changed_at else 0,
    }

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=int(expire_days * 24 * 3600)  # En secondes
    )


def verify_token(token: str) -> Optional[TokenData]:
    """
    Valide un JWT token et retourne ses données.
    
    Retourne None si le token est invalide/expiré.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Vérifie que le token n'est pas expiré
        exp = payload.get("exp")
        if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
            return None
        
        return TokenData(
            user_id=payload.get("user_id"),
            username=payload.get("username"),
            exp=exp,
            pwd_ts=payload.get("pwd_ts", 0),
        )
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError, jwt.DecodeError):
        return None


def decode_token_unsafe(token: str) -> Optional[dict]:
    """
    Décode un token SANS valider la signature (pour tests/debug).
    
    ⚠️ N'utilise JAMAIS cette fonction pour valider les accès!
    Uniquement pour lire les données du token avant validation.
    """
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Dépendances FastAPI pour l'authentification
# ═══════════════════════════════════════════════════════════════════════════

# Routes accessibles même quand must_change_password=True — l'utilisateur doit
# pouvoir consulter son profil et changer son mot de passe, rien d'autre.
_ALLOWED_PATHS_WHEN_MUST_CHANGE_PASSWORD = {
    "/api/auth/me",
    "/api/auth/me/password",
    "/api/auth/logout",
}


def _get_current_user_from_token(authorization: str = Header(None)) -> TokenData:
    """Valide le JWT et retourne juste les données du token (pas l'utilisateur)."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Schéma invalide")
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Format de token invalide",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = verify_token(token)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return token_data


async def get_current_user(
    request: Request,
    token_data: TokenData = Depends(_get_current_user_from_token),
) -> "User":
    """
    Middleware: Valide le token JWT et retourne l'utilisateur.
    
    Utilisation dans les routes:
        @router.get("/protected")
        async def protected_route(current_user: User = Depends(get_current_user)):
            # Accès sécurisé à current_user
            return {"message": f"Bonjour {current_user.username}"}
    
    Sécurité:
    - Vérifie la présence du header Authorization
    - Valide le format "Bearer <token>"
    - Décrypte et valide le JWT
    - Retourne l'utilisateur de la DB
    """
    from models import User as UserModel, get_db as get_db_session
    
    db = next(get_db_session())
    
    try:
        # Récupère l'utilisateur de la DB
        user = db.query(UserModel).filter(UserModel.id == token_data.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Utilisateur non trouvé",
            )

        # Invalide les tokens émis AVANT un changement/reset de mot de passe
        # (protège un compte compromis : le vieux token cesse de fonctionner
        # dès que le mot de passe est changé, sans attendre son expiration).
        if user.password_changed_at is not None:
            changed_ts = int(user.password_changed_at.timestamp())
            if token_data.pwd_ts < changed_ts:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session invalidée suite à un changement de mot de passe. Reconnectez-vous.",
                )

        # Mot de passe temporaire (créé/reset par un admin) : bloque tout sauf
        # consulter son profil et le changer, tant qu'il n'a pas été remplacé
        # par un mot de passe choisi par l'utilisateur (voir change_own_password).
        if user.must_change_password and request.url.path not in _ALLOWED_PATHS_WHEN_MUST_CHANGE_PASSWORD:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous devez changer votre mot de passe temporaire avant de continuer.",
            )

        return user
    finally:
        db.close()


async def get_current_admin(current_user: "User" = Depends(get_current_user)) -> "User":
    """Vérifie que l'utilisateur courant est administrateur."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    return current_user


# ═══════════════════════════════════════════════════════════════════════════
# Protection anti brute-force
# ═══════════════════════════════════════════════════════════════════════════

import time
import threading


# ─────────────────────────────────────────────────────────────────────────────
# Identification du client derrière un (ou plusieurs) reverse proxy
# ─────────────────────────────────────────────────────────────────────────────
#
# TRUSTED_PROXIES : liste (séparée par des virgules) d'adresses IP, de blocs
# CIDR ou de noms d'hôte dont on accepte les en-têtes de transfert.
#
# ⚠️ Ne PAS se contenter de « toute adresse privée est un proxy de confiance ».
# Docker fait du SNAT sur les ports publiés : une requête venue d'Internet vers
# le port 8000 arrive au backend depuis la passerelle (172.18.0.1), une adresse
# privée. L'heuristique « privée = proxy » rendait donc X-Real-IP usurpable par
# n'importe qui dès lors que le port 8000 était exposé — vérifié : 15 tentatives
# de login sans un seul 429. Seul nginx, qui arrive depuis sa propre IP de
# conteneur (172.18.0.3), doit être approuvé.
#
# Défaut (docker-compose.yml) : "frontend", le nom de service du nginx fourni.
# Vide = aucune confiance, seul le pair TCP fait foi (sûr même exposé nu).
_TRUSTED_PROXIES_RAW = os.getenv("TRUSTED_PROXIES", "").strip()
_TRUSTED_NETWORKS: list = []
_TRUSTED_HOSTNAMES: list = []

for _entry in (part.strip() for part in _TRUSTED_PROXIES_RAW.split(",") if part.strip()):
    try:
        _TRUSTED_NETWORKS.append(ipaddress.ip_network(_entry, strict=False))
    except ValueError:
        # Pas une IP ni un CIDR → nom d'hôte, résolu à la demande (l'IP du
        # conteneur nginx change à chaque recréation).
        _TRUSTED_HOSTNAMES.append(_entry)

_DNS_CACHE_TTL = 60  # secondes
_dns_cache: dict[str, tuple[float, frozenset]] = {}
_dns_lock = threading.Lock()


def _resolve_hostname(name: str) -> frozenset:
    """Résout un nom d'hôte en IP, avec un cache court (les IP de conteneur bougent)."""
    import socket
    import time as _time

    now = _time.monotonic()
    with _dns_lock:
        cached = _dns_cache.get(name)
        if cached and cached[0] > now:
            return cached[1]

    try:
        infos = socket.getaddrinfo(name, None)
        addresses = frozenset(info[4][0] for info in infos)
    except OSError:
        addresses = frozenset()

    with _dns_lock:
        _dns_cache[name] = (now + _DNS_CACHE_TTL, addresses)
    return addresses


def _is_trusted_proxy(host: str) -> bool:
    """Vrai si `host` figure dans TRUSTED_PROXIES (IP, CIDR ou nom d'hôte)."""
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False

    if any(addr in network for network in _TRUSTED_NETWORKS):
        return True

    return any(host in _resolve_hostname(name) for name in _TRUSTED_HOSTNAMES)


def get_client_ip(request: Request) -> str:
    """
    IP réelle du client, non falsifiable par l'appelant.

    ⚠️ Ne JAMAIS lire ``X-Forwarded-For[0]``. nginx construit cet en-tête avec
    ``$proxy_add_x_forwarded_for``, qui *ajoute* l'IP réelle **derrière** la
    valeur envoyée par le client : son premier élément est entièrement contrôlé
    par l'appelant. Un ``X-Forwarded-For`` différent à chaque requête suffisait
    à repartir d'un compteur vierge et à bruteforcer sans jamais déclencher 429.

    Algorithme (celui des frameworks qui gèrent correctement les proxys) :
      1. Si le pair TCP n'est pas dans TRUSTED_PROXIES, aucun en-tête n'est lu :
         seul ``request.client.host`` fait foi. C'est le cas d'une exposition
         directe du port 8000 — l'usurpation devient sans effet.
      2. Sinon on parcourt ``X-Forwarded-For`` **de droite à gauche** et on
         retourne la première adresse qui n'est pas un proxy de confiance :
         c'est le client réel. Tout ce que l'appelant a pu injecter se trouve
         plus à gauche et n'est jamais atteint.
      3. À défaut de ``X-Forwarded-For``, ``X-Real-IP`` puis le pair TCP.

    Chaînes à plusieurs proxys (reverse proxy personnel devant le nginx fourni) :
    ajouter l'IP du proxy amont à TRUSTED_PROXIES, sinon tous les visiteurs sont
    comptabilisés sous la seule IP de ce proxy — sûr, mais un seul attaquant
    verrouillerait alors tout le monde.
    """
    peer = request.client.host if request.client else ""

    if not peer or not _is_trusted_proxy(peer):
        return peer or "unknown"

    forwarded = request.headers.get("x-forwarded-for", "")
    hops = [part.strip() for part in forwarded.split(",") if part.strip()]
    if hops:
        for candidate in reversed(hops):
            if not _is_trusted_proxy(candidate):
                return candidate
        # Toute la chaîne est constituée de proxys de confiance : on retient le
        # plus en amont, faute de mieux.
        return hops[0]

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip

    return peer


class LoginRateLimiter:
    """
    Protection anti brute-force par IP.

    Paliers de verrouillage (tentatives consécutives échouées) :
      - 3 échecs  →  30 s de blocage
      - 6 échecs  →  5 min
      - 9 échecs  →  15 min
      - 12+ échecs → 1 h

    Un login réussi réinitialise le compteur pour cette IP.
    Les entrées expirent automatiquement après 2 h d'inactivité.
    """

    THRESHOLDS = [
        (3, 30),       # 3  échecs → 30 s
        (6, 300),      # 6  échecs → 5 min
        (9, 900),      # 9  échecs → 15 min
        (12, 3600),    # 12 échecs → 1 h
    ]
    ENTRY_TTL = 7200   # purge après 2 h d'inactivité

    def __init__(self, thresholds: Optional[list] = None):
        # {clé: {"failures": int, "locked_until": float, "last_attempt": float}}
        # La clé est une IP pour login_limiter, un nom d'utilisateur pour
        # account_limiter — la mécanique est identique.
        self.thresholds = thresholds or self.THRESHOLDS
        self._store: dict[str, dict] = {}
        self._lock = threading.Lock()

    def _purge_stale(self):
        """Supprime les entrées inactives (appelé sous verrou)."""
        now = time.monotonic()
        stale = [ip for ip, v in self._store.items() if now - v["last_attempt"] > self.ENTRY_TTL]
        for ip in stale:
            del self._store[ip]

    def _lockout_seconds(self, failures: int) -> int:
        """Retourne la durée de blocage pour le nombre d'échecs donné.
        
        Se déclenche uniquement aux paliers (3, 6, 9) et en continu au dernier
        palier (12+). Entre les paliers, l'utilisateur peut réessayer librement.
        """
        last_threshold, last_seconds = self.thresholds[-1]
        if failures >= last_threshold:
            return last_seconds
        for threshold, seconds in self.thresholds:
            if failures == threshold:
                return seconds
        return 0

    def check(self, ip: str) -> int:
        """
        Vérifie si l'IP est verrouillée.
        Retourne 0 si autorisé, sinon le nombre de secondes restantes.
        """
        with self._lock:
            entry = self._store.get(ip)
            if not entry:
                return 0
            remaining = entry["locked_until"] - time.monotonic()
            return max(0, int(remaining + 0.5))  # arrondi supérieur

    def record_failure(self, ip: str):
        """Enregistre un échec de connexion."""
        now = time.monotonic()
        with self._lock:
            self._purge_stale()
            entry = self._store.get(ip)
            if entry is None:
                entry = {"failures": 0, "locked_until": 0.0, "last_attempt": now}
                self._store[ip] = entry
            entry["failures"] += 1
            entry["last_attempt"] = now
            lockout = self._lockout_seconds(entry["failures"])
            if lockout > 0:
                entry["locked_until"] = now + lockout

    def record_success(self, ip: str):
        """Réinitialise le compteur après un login réussi."""
        with self._lock:
            self._store.pop(ip, None)

    def reset(self):
        """Réinitialise tous les compteurs (toutes les IPs)."""
        with self._lock:
            self._store.clear()


# Instance globale unique — verrouillage par IP
login_limiter = LoginRateLimiter()

# Verrouillage par compte, indépendant de l'IP.
#
# Le comptage par IP ne protège plus rien dès que l'IP n'est pas fiable
# (port 8000 exposé en direct, en-têtes usurpables) ou qu'elle est partagée
# par tous les visiteurs (reverse proxy amont non déclaré, NAT). Un attaquant
# distribué contourne aussi trivialement une limite par IP.
#
# Paliers volontairement plus courts que ceux par IP : ce compteur est
# déclenchable par un tiers contre un compte légitime, on veut donc ralentir
# fortement le bruteforce sans jamais bloquer un utilisateur très longtemps.
ACCOUNT_THRESHOLDS = [
    (5, 30),     # 5  échecs → 30 s
    (10, 120),   # 10 échecs → 2 min
    (15, 300),   # 15+ échecs → 5 min (plafond)
]
account_limiter = LoginRateLimiter(thresholds=ACCOUNT_THRESHOLDS)
