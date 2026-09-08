"""Constants for RideLog integration."""

DOMAIN = "ridelog"
PLATFORMS = ["sensor"]

# Configuration keys
CONF_API_URL = "api_url"
CONF_HA_INIT_KEY = "ha_init_key"
CONF_USERNAME = "username"
CONF_PASSWORD = "password"
CONF_ACCESS_TOKEN = "access_token"
CONF_SCAN_INTERVAL = "scan_interval"

# Default values
# Port de l'INTERFACE WEB (nginx), pas celui du backend. C'est nginx qui
# proxifie /api vers le backend ; le port 8000 n'a pas vocation à être publié
# (voir la section « EXPOSITION SUR INTERNET » de .env.example). Proposer 8000
# ici envoyait droit dans le mur toute installation conforme à cette consigne.
DEFAULT_API_URL = "http://localhost:3100"
DEFAULT_SCAN_INTERVAL = 3600  # 1 hour

# Fuel type mappings
FUEL_TYPES = {
    "sp95": {"name": "Essence SP95", "icon": "mdi:fuel", "emoji": "⛽"},
    "sp98": {"name": "Essence SP98", "icon": "mdi:fuel", "emoji": "⛽"},
    "e85": {"name": "Éthanol E85", "icon": "mdi:leaf", "emoji": "🌿"},
    "diesel": {"name": "Diesel", "icon": "mdi:fuel-cell", "emoji": "⛽"},
}

# Maintenance status
MAINTENANCE_STATUS = {
    "due_soon": {"name": "À faire bientôt", "icon": "mdi:alert-outline", "color": "orange"},
    "overdue": {"name": "En retard", "icon": "mdi:alert", "color": "red"},
    "ok": {"name": "OK", "icon": "mdi:check-circle", "color": "green"},
}