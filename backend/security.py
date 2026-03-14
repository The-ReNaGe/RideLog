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
import os

import bcrypt
import jwt
from pydantic import BaseModel
from fastapi import HTTPException, Header, Depends, status
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from models import User


# ═══════════════════════════════════════════════════════════════════════════
# Configuration - VARIABLES D'ENVIRONNEMENT
# ═══════════════════════════════════════════════════════════════════════════

# JWT_SECRET: Clé pour signer les tokens (HMAC-SHA256)
# - Définie dans .env et passée par docker-compose.yml
# - Ne JAMAIS hardcoder en production
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production-🔐")

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

def create_access_token(user_id: int, username: str, expire_days: Optional[int] = None) -> TokenResponse:
    """
    Crée un JWT token d'accès.
    
    Sécurité du token:
    - Algorithme: HS256 (HMAC-SHA256)
    - Secret: Défini dans JWT_SECRET
    - Expiration: Configurable (par défaut 7 jours)
    - Payload: user_id, username, exp
    
    Le token contient tout ce qui est nécessaire pour identifier l'utilisateur
    (pas de stockage de session côté serveur).
    
    Args:
        user_id: ID de l'utilisateur
        username: Nom d'utilisateur
        expire_days: Jours de validité (défaut: JWT_EXPIRE_DAYS = 7)
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
            exp=exp
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

    def __init__(self):
        # {ip: {"failures": int, "locked_until": float, "last_attempt": float}}
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
        
        Se déclenche uniquement aux paliers (3, 6, 9) et en continu à 12+.
        Entre les paliers, l'utilisateur peut réessayer librement.
        """
        if failures >= 12:
            return 3600
        for threshold, seconds in self.THRESHOLDS:
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


# Instance globale unique
login_limiter = LoginRateLimiter()
