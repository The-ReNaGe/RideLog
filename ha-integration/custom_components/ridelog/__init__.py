"""RideLog Home Assistant Integration."""

import asyncio
import logging
from datetime import timedelta, datetime, timezone
from typing import Any

import httpx
import jwt
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, DEFAULT_API_URL, DEFAULT_SCAN_INTERVAL, PLATFORMS, CONF_API_URL, CONF_ACCESS_TOKEN
from .api import RideLogAPI

LOGGER = logging.getLogger(__name__)

# Token refresh check interval (daily)
TOKEN_REFRESH_CHECK_INTERVAL = timedelta(hours=24)
# Refresh token if expiring in 7 days
TOKEN_REFRESH_THRESHOLD_DAYS = 7


class RideLogDataUpdateCoordinator(DataUpdateCoordinator):
    """RideLog data update coordinator."""

    def __init__(self, hass: HomeAssistant, api: RideLogAPI):
        """Initialize the coordinator."""
        super().__init__(
            hass,
            LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
        self.api = api

    async def _async_update_data(self):
        """Fetch data from RideLog API."""
        try:
            vehicles = await self.api.get_vehicles()
            
            # Fetch maintenances for each vehicle
            maintenances = {}
            for vehicle in vehicles:
                vehicle_id = vehicle.get("id")
                try:
                    maintenances[vehicle_id] = await self.api.get_vehicle_maintenances(vehicle_id)
                except Exception as err:
                    LOGGER.warning(f"Error fetching maintenances for vehicle {vehicle_id}: {err}")
                    maintenances[vehicle_id] = []
            
            return {"vehicles": vehicles, "maintenances": maintenances}
        except Exception as err:
            raise UpdateFailed(f"Error fetching RideLog data: {err}") from err


def _get_token_expiry(token: str) -> datetime | None:
    """Decode JWT token (without signature verification) to get expiry time."""
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        exp_timestamp = payload.get("exp")
        if exp_timestamp:
            return datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
    except Exception as err:
        LOGGER.warning(f"Could not decode token: {err}")
    return None


async def _async_refresh_token_if_needed(
    hass: HomeAssistant, entry: ConfigEntry, api: RideLogAPI
) -> bool:
    """Check if token needs refresh and refresh if within threshold."""
    token = entry.data.get(CONF_ACCESS_TOKEN)
    if not token:
        return False
    
    expiry = _get_token_expiry(token)
    if not expiry:
        return False
    
    now = datetime.now(timezone.utc)
    time_until_expiry = expiry - now
    refresh_threshold = timedelta(days=TOKEN_REFRESH_THRESHOLD_DAYS)
    
    LOGGER.debug(f"Token expires in {time_until_expiry.days} days")
    
    # If token expires within 7 days, refresh it
    if time_until_expiry < refresh_threshold:
        try:
            LOGGER.info("Refreshing RideLog token...")
            new_token = await api.refresh_access_token()
            
            # Update entry with new token
            hass.config_entries.async_update_entry(
                entry,
                data={**entry.data, CONF_ACCESS_TOKEN: new_token}
            )
            
            LOGGER.info("Token refreshed successfully")
            return True
        except Exception as err:
            LOGGER.error(f"Failed to refresh token: {err}")
            return False
    
    return False


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up RideLog from a config entry."""
    api_url = entry.data.get(CONF_API_URL, DEFAULT_API_URL)
    access_token = entry.data.get(CONF_ACCESS_TOKEN)
    
    api = RideLogAPI(hass, api_url, access_token)
    coordinator = RideLogDataUpdateCoordinator(hass, api)
    
    # Fetch initial data
    await coordinator.async_config_entry_first_refresh()
    
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "api": api,
    }
    
    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    
    # Schedule token refresh check (daily)
    async def check_token_refresh(_: Any = None) -> None:
        """Check and refresh token if needed."""
        await _async_refresh_token_if_needed(hass, entry, api)
    
    # Check token every 24 hours
    entry.async_on_unload(
        async_track_time_interval(
            hass,
            check_token_refresh,
            TOKEN_REFRESH_CHECK_INTERVAL,
        )
    )
    
    # Also check on startup (with a small delay)
    async def check_on_startup() -> None:
        await asyncio.sleep(5)
        await check_token_refresh()
    
    hass.async_create_task(check_on_startup())
    
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload RideLog config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
