"""RideLog API Client."""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List

import httpx
from homeassistant.core import HomeAssistant

LOGGER = logging.getLogger(__name__)


class RideLogAPI:
    """RideLog API client."""

    def __init__(self, hass: HomeAssistant, api_url: str, access_token: str = None):
        """Initialize API client."""
        self.hass = hass
        self.api_url = api_url.rstrip("/")
        self.access_token = access_token
        self._client = None
        self._fuel_stations_cache = {}
        self._cache_ttl = timedelta(minutes=30)

    async def get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            headers = {"Content-Type": "application/json"}
            if self.access_token:
                headers["Authorization"] = f"Bearer {self.access_token}"
            self._client = httpx.AsyncClient(timeout=10, headers=headers)
        return self._client

    async def refresh_access_token(self) -> str:
        """Refresh the access token and return the new one."""
        if not self.access_token:
            raise ValueError("No token to refresh")
        
        try:
            client = await self.get_client()
            response = await client.post(
                f"{self.api_url}/api/auth/refresh-token",
                headers={"Authorization": f"Bearer {self.access_token}"}
            )
            response.raise_for_status()
            data = response.json()
            new_token = data.get("access_token")
            
            if new_token:
                self.access_token = new_token
                # Update headers with new token
                if self._client:
                    self._client.headers["Authorization"] = f"Bearer {self.access_token}"
            
            return new_token
        except Exception as err:
            LOGGER.error(f"Token refresh failed: {err}")
            raise

    async def login(self, username: str, password: str) -> str:
        """Authenticate and return access token."""
        try:
            client = await self.get_client()
            response = await client.post(
                f"{self.api_url}/api/auth/login",
                json={"username": username, "password": password}
            )
            response.raise_for_status()
            data = response.json()
            self.access_token = data["access_token"]
            # Update headers with new token
            if self._client:
                self._client.headers["Authorization"] = f"Bearer {self.access_token}"
            return self.access_token
        except Exception as err:
            LOGGER.error(f"Login failed: {err}")
            raise

    async def init_home_assistant(self, init_key: str) -> Dict[str, Any]:
        """Initialize Home Assistant integration account."""
        try:
            client = await self.get_client()
            response = await client.post(
                f"{self.api_url}/api/auth/ha-init",
                params={"init_key": init_key}
            )
            response.raise_for_status()
            data = response.json()
            self.access_token = data.get("access_token")
            # Update headers with new token
            if self._client and self.access_token:
                self._client.headers["Authorization"] = f"Bearer {self.access_token}"
            return data
        except Exception as err:
            LOGGER.error(f"HA init failed: {err}")
            raise

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()

    async def get_vehicles(self) -> List[Dict[str, Any]]:
        """Fetch all vehicles."""
        try:
            client = await self.get_client()
            response = await client.get(f"{self.api_url}/api/vehicles")
            response.raise_for_status()
            return response.json()
        except Exception as err:
            LOGGER.error(f"Error fetching vehicles: {err}")
            return []

    async def get_vehicle_maintenances(self, vehicle_id: int) -> List[Dict[str, Any]]:
        """Fetch upcoming maintenances for a vehicle."""
        try:
            client = await self.get_client()
            response = await client.get(
                f"{self.api_url}/api/vehicles/{vehicle_id}/upcoming"
            )
            response.raise_for_status()
            data = response.json()
            
            # Extract and categorize by status
            all_maintenances = data.get("upcoming", [])
            # Status "urgent" and "warning" = à venir (upcoming - approaching limits)
            # Status "overdue" = en retard (due or past due)
            # Status "ok" = not displayed (far from limit)
            upcoming = [m for m in all_maintenances if m.get("status") in ["urgent", "warning"]]
            overdue = [m for m in all_maintenances if m.get("status") == "overdue"]
            
            return {"upcoming": upcoming, "overdue": overdue}
        except Exception as err:
            LOGGER.error(f"Error fetching maintenances for vehicle {vehicle_id}: {err}")
            return {"upcoming": [], "overdue": []}

    async def search_fuel_stations(
        self, city: str, fuel_type: str = "diesel", max_distance: int = 20
    ) -> List[Dict[str, Any]]:
        """Search fuel stations (with caching to prevent API spam)."""
        cache_key = f"{city}_{fuel_type}_{max_distance}"
        
        # Check cache
        if cache_key in self._fuel_stations_cache:
            cached_data, cached_time = self._fuel_stations_cache[cache_key]
            if datetime.now() - cached_time < self._cache_ttl:
                LOGGER.debug(f"Using cached fuel stations for {cache_key}")
                return cached_data
        
        try:
            client = await self.get_client()
            response = await client.get(
                f"{self.api_url}/api/fuel-stations/search",
                params={"city": city, "fuel_type": fuel_type, "max_distance": max_distance},
            )
            response.raise_for_status()
            data = response.json()
            
            # Cache the result
            self._fuel_stations_cache[cache_key] = (data, datetime.now())
            return data
        except Exception as err:
            LOGGER.error(f"Error searching fuel stations: {err}")
            return []

    async def get_fuel_types(self) -> Dict[str, Any]:
        """Get available fuel types."""
        try:
            client = await self.get_client()
            response = await client.get(f"{self.api_url}/api/fuel-stations/fuel-types")
            response.raise_for_status()
            return response.json()
        except Exception as err:
            LOGGER.error(f"Error fetching fuel types: {err}")
            return {}
