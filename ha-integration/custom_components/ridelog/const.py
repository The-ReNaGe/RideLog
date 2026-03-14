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
DEFAULT_API_URL = "http://localhost:8000"
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