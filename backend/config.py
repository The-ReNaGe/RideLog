"""
Configuration centralisée - Paramètres, webhooks, et intégrations.
"""
import os
from typing import Optional

# ---------------------------------------------------------------------------
# SYSTÈME & LOGGING
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"

# ---------------------------------------------------------------------------
# BASE DE DONNÉES
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data.db")

# ---------------------------------------------------------------------------
# CORS & API
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
API_ENDPOINT = os.getenv("API_ENDPOINT", "http://localhost:8000")
API_VERSION = "1.2.0"

# ---------------------------------------------------------------------------
# HOME ASSISTANT INTEGRATION
# ---------------------------------------------------------------------------
HA_ENABLED = os.getenv("HA_ENABLED", "false").lower() == "true"
HA_INIT_KEY: Optional[str] = os.getenv("HA_INIT_KEY", None)  # Clé secrète pour l'initialisation

# ---------------------------------------------------------------------------
# APIS EXTERNES - PLAQUES & ESSENCE
# ---------------------------------------------------------------------------
RAPIDAPI_KEY: Optional[str] = os.getenv("RAPIDAPI_KEY", None)
PLATE_API_TOKEN: Optional[str] = os.getenv("PLATE_API_TOKEN", None)

# ---------------------------------------------------------------------------
# INSCRIPTION
# ---------------------------------------------------------------------------
# Mode d'inscription : invite (sur invitation), open (ouvert), closed (privé/fermé)
REGISTRATION_MODE: str = os.getenv("REGISTRATION_MODE", "invite")

# ---------------------------------------------------------------------------
# PLANIFICATION & RAPPELS
# ---------------------------------------------------------------------------
REMINDER_INTERVAL = int(os.getenv("REMINDER_INTERVAL", "3600"))  # secondes (1 heure)
REMINDER_ENABLED = os.getenv("REMINDER_ENABLED", "true").lower() == "true"

# ---------------------------------------------------------------------------
# Validation de la config
# ---------------------------------------------------------------------------
def validate_config():
    """Valide les configurations critiques."""
    errors = []
    return errors


def get_config_summary():
    """Retourne un résumé de la configuration."""
    return {
        "log_level": LOG_LEVEL,
        "debug": DEBUG_MODE,
        "database": DATABASE_URL,
        "ha_enabled": HA_ENABLED,
        "reminder_enabled": REMINDER_ENABLED,
    }
