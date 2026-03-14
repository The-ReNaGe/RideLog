"""Config flow for RideLog integration."""

import asyncio
import logging
from typing import Any, Dict, Optional

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN, DEFAULT_API_URL, CONF_API_URL, CONF_HA_INIT_KEY, CONF_ACCESS_TOKEN
from .api import RideLogAPI

LOGGER = logging.getLogger(__name__)


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
                    await api.close()
                    
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
                    LOGGER.error("Failed to get token from HA init")
                    errors["base"] = "cannot_connect"
                    
            except Exception as err:
                LOGGER.error(f"HA init failed: {err}")
                errors["base"] = "cannot_connect"
            finally:
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
