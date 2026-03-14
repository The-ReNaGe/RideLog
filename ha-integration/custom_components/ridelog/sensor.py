"""RideLog sensors."""

import logging
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, MAINTENANCE_STATUS
from . import RideLogDataUpdateCoordinator

LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up RideLog sensors."""
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]

    entities = []

    # Create sensors for each vehicle
    if coordinator.data:
        vehicles = coordinator.data.get("vehicles", [])
        for vehicle in vehicles:
            vehicle_id = vehicle.get("id")
            vehicle_name = vehicle.get("name", f"Vehicle {vehicle_id}")

            # Vehicle summary sensor
            entities.append(
                RideLogVehicleSummary(
                    coordinator, vehicle_id, vehicle_name, entry.entry_id
                )
            )

            # Upcoming maintenances counter
            entities.append(
                RideLogMaintenanceUpcomingSensor(
                    coordinator, vehicle_id, vehicle_name, entry.entry_id
                )
            )

            # Overdue maintenances counter
            entities.append(
                RideLogMaintenanceOverdueSensor(
                    coordinator, vehicle_id, vehicle_name, entry.entry_id
                )
            )

    async_add_entities(entities)


class RideLogVehicleSummary(CoordinatorEntity, SensorEntity):
    """Vehicle summary sensor with all info."""

    def __init__(
        self,
        coordinator: RideLogDataUpdateCoordinator,
        vehicle_id: int,
        vehicle_name: str,
        entry_id: str,
    ):
        """Initialize the sensor."""
        super().__init__(coordinator)
        self.vehicle_id = vehicle_id
        self.vehicle_name = vehicle_name
        self._attr_unique_id = f"ridelog_{vehicle_id}_summary"
        self._attr_name = f"{vehicle_name} Summary"
        self._attr_icon = "mdi:car"

    @property
    def state(self) -> str:
        """Return the state."""
        vehicle = self._get_vehicle()
        if not vehicle:
            return "unknown"

        # Return mileage
        mileage = vehicle.get("current_mileage", 0)
        return f"{mileage} km"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra attributes."""
        vehicle = self._get_vehicle()
        if not vehicle:
            return {}

        return {
            "name": vehicle.get("name"),
            "brand": vehicle.get("brand"),
            "model": vehicle.get("model"),
            "year": vehicle.get("year"),
            "mileage": vehicle.get("current_mileage"),
            "motorization": vehicle.get("motorization"),
            "type": vehicle.get("vehicle_type"),
            "displacement": vehicle.get("displacement"),
        }

    def _get_vehicle(self) -> dict[str, Any] | None:
        """Get vehicle data from coordinator."""
        if not self.coordinator.data:
            return None

        vehicles = self.coordinator.data.get("vehicles", [])
        for vehicle in vehicles:
            if vehicle.get("id") == self.vehicle_id:
                return vehicle
        return None


class RideLogMaintenanceUpcomingSensor(CoordinatorEntity, SensorEntity):
    """Upcoming maintenances counter."""

    def __init__(
        self,
        coordinator: RideLogDataUpdateCoordinator,
        vehicle_id: int,
        vehicle_name: str,
        entry_id: str,
    ):
        """Initialize the sensor."""
        super().__init__(coordinator)
        self.vehicle_id = vehicle_id
        self.vehicle_name = vehicle_name
        self._attr_unique_id = f"ridelog_{vehicle_id}_maintenance_upcoming"
        self._attr_name = f"{vehicle_name} - Maintenance à Venir"
        self._attr_icon = "mdi:alert-outline"
        self._attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def state(self) -> int:
        """Return count of upcoming maintenances."""
        upcoming = self._get_upcoming_maintenances()
        return len(upcoming)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return list of upcoming maintenances."""
        upcoming = self._get_upcoming_maintenances()
        return {
            "count": len(upcoming),
            "maintenances": [
                {
                    "intervention_type": m.get("intervention_type"),
                    "status": m.get("status"),
                    "km_remaining": m.get("km_remaining"),
                    "days_remaining": m.get("days_remaining"),
                    "next_due_mileage": m.get("next_due_mileage"),
                    "next_due_date": m.get("next_due_date"),
                    "estimated_cost_min": m.get("estimated_cost_min"),
                    "estimated_cost_max": m.get("estimated_cost_max"),
                }
                for m in upcoming
            ],
        }

    def _get_upcoming_maintenances(self) -> list[dict[str, Any]]:
        """Get upcoming maintenances."""
        if not self.coordinator.data:
            return []

        maintenances = self.coordinator.data.get("maintenances", {})
        vehicle_maintenances = maintenances.get(self.vehicle_id, {})

        # Return upcoming from the categorized dict
        return vehicle_maintenances.get("upcoming", [])


class RideLogMaintenanceOverdueSensor(CoordinatorEntity, SensorEntity):
    """Overdue maintenances counter."""

    def __init__(
        self,
        coordinator: RideLogDataUpdateCoordinator,
        vehicle_id: int,
        vehicle_name: str,
        entry_id: str,
    ):
        """Initialize the sensor."""
        super().__init__(coordinator)
        self.vehicle_id = vehicle_id
        self.vehicle_name = vehicle_name
        self._attr_unique_id = f"ridelog_{vehicle_id}_maintenance_overdue"
        self._attr_name = f"{vehicle_name} - Maintenance en Retard"
        self._attr_icon = "mdi:alert"
        self._attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def state(self) -> int:
        """Return count of overdue maintenances."""
        overdue = self._get_overdue_maintenances()
        return len(overdue)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return list of overdue maintenances."""
        overdue = self._get_overdue_maintenances()
        return {
            "count": len(overdue),
            "maintenances": [
                {
                    "intervention_type": m.get("intervention_type"),
                    "status": m.get("status"),
                    "km_remaining": m.get("km_remaining"),
                    "days_remaining": m.get("days_remaining"),
                    "next_due_mileage": m.get("next_due_mileage"),
                    "next_due_date": m.get("next_due_date"),
                    "estimated_cost_min": m.get("estimated_cost_min"),
                    "estimated_cost_max": m.get("estimated_cost_max"),
                }
                for m in overdue
            ],
        }

    def _get_overdue_maintenances(self) -> list[dict[str, Any]]:
        """Get overdue maintenances."""
        if not self.coordinator.data:
            return []

        maintenances = self.coordinator.data.get("maintenances", {})
        vehicle_maintenances = maintenances.get(self.vehicle_id, {})

        # Return overdue from the categorized dict
        return vehicle_maintenances.get("overdue", [])
