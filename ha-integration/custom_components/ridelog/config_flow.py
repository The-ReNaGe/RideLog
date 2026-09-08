"""Config flow for RideLog integration."""

import asyncio
import logging
from typing import Any, Dict, Optional

import httpx
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN, DEFAULT_API_URL, CONF_API_URL, CONF_HA_INIT_KEY, CONF_ACCESS_TOKEN
from .api import RideLogAPI, describe_error

LOGGER = logging.getLogger(__name__)

# Chaque refus du backend a une cause distincte, et l'utilisateur doit pouvoir
# la lire. Tout était auparavant rendu en « cannot_connect » : impossible de
# distinguer une clé erronée d'un serveur injoignable ou d'une mauvaise URL.
# Le cas 404 est le plus trompeur — l'hôte répond, mais ce n'est pas RideLog
# (typiquement le port du backend au lieu de celui de l'interface web).
_ERROR_BY_STATUS = {
    403: "invalid_auth",        # clé fausse, ou intégration désactivée dans RideLog
    404: "wrong_url",           # ça répond, mais ce n'est pas l'API RideLog
    429: "too_many_attempts",   # rate limiting du backend
    503: "not_configured",      # HA_INIT_KEY absente du .env de RideLog
}


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for RideLog."""

    VERSION = 1

    async def async_step_user(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle the initial step - API URL only."""
        errors = {}
        
        if user_input is not None:
            api_url = user_input[CONF_API_URL]
            ha_init_key = user_input[CONF_HA_INIT_KEY]
            
            # Initialize Home Assistant integration
            api = RideLogAPI(self.hass, api_url)
            try:
                # Call /auth/ha-init to create/init homeassistant account
                token_response = await api.init_home_assistant(ha_init_key)
                
                if token_response and "access_token" in token_response:
                    # Store configuration with token
                    config_data = {
                        CONF_API_URL: api_url,
                        CONF_ACCESS_TOKEN: token_response["access_token"],
                    }

                    return self.async_create_entry(
                        title="RideLog",
                        data=config_data
                    )
                else:
                    LOGGER.error("Réponse de RideLog sans jeton d'accès")
                    errors["base"] = "cannot_connect"

            except httpx.HTTPStatusError as err:
                errors["base"] = _ERROR_BY_STATUS.get(
                    err.response.status_code, "cannot_connect"
                )
                LOGGER.error("RideLog a refusé la configuration : %s", describe_error(err))
            except Exception as err:
                LOGGER.error("Configuration RideLog impossible : %s", describe_error(err))
                errors["base"] = "cannot_connect"
            finally:
                # Une seule fermeture : la branche de succès en faisait une
                # seconde, juste avant que ce bloc ne s'exécute de toute façon.
                await api.close()

        return self.async_show_form(
            step_id="user",
            data_schema=self._get_data_schema(),
            errors=errors,
            description_placeholders={
                "default_url": DEFAULT_API_URL
            }
        )

    def _get_data_schema(self) -> vol.Schema:
        """Return the data schema."""
        return vol.Schema(
            {
                vol.Required(CONF_API_URL, default=DEFAULT_API_URL): str,
                vol.Required(CONF_HA_INIT_KEY): str,
            }
        )
