"""RideLog Fuel Stations Search Service."""

import logging
from typing import Any, Dict

from homeassistant.core import HomeAssistant, ServiceCall

from .const import DOMAIN
from .api import RideLogAPI

LOGGER = logging.getLogger(__name__)

SERVICE_SEARCH_FUEL_STATIONS = "search_fuel_stations"


async def async_setup_services(hass: HomeAssistant) -> None:
    """Set up RideLog services."""

    async def handle_search_fuel_stations(call: ServiceCall) -> None:
        """Handle fuel stations search service call."""
        city = call.data.get("city")
        fuel_type = call.data.get("fuel_type", "diesel")
        max_distance = call.data.get("max_distance", 20)

        # Get API from first config entry
        if DOMAIN not in hass.data or not hass.data[DOMAIN]:
            LOGGER.error("RideLog integration not configured")
            return

        api = list(hass.data[DOMAIN].values())[0]["api"]
        
        LOGGER.info(
            f"Searching fuel stations: city={city}, "
            f"fuel_type={fuel_type}, max_distance={max_distance}km"
        )
        
        stations = await api.search_fuel_stations(
            city=city, fuel_type=fuel_type, max_distance=max_distance
        )
        
        # Store result in context for template access
        call.return_value = {
            "stations": stations,
            "count": len(stations),
            "city": city,
            "fuel_type": fuel_type,
        }

    hass.services.async_register(
        DOMAIN,
        SERVICE_SEARCH_FUEL_STATIONS,
        handle_search_fuel_stations,
        schema=None,  # Allow any data
    )
