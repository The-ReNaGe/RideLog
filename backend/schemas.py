"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------
class VehicleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    vehicle_type: str = Field(..., pattern=r"^(car|motorcycle)$")
    brand: str = Field(..., min_length=1, max_length=100)
    model: str = Field(..., min_length=1, max_length=100)
    year: int = Field(..., ge=1900, le=2100)
    registration_date: Optional[datetime] = Field(None)
    motorization: str = Field(..., pattern=r"^(essence|diesel|hybrid|electric|thermal)$")
    displacement: Optional[int] = Field(None, ge=50, le=10000)
    range_category: str = Field("generalist", pattern=r"^(accessible|generalist|premium)$")
    current_mileage: int = Field(0, ge=0)
    purchase_price: Optional[float] = Field(None, ge=0)
    service_interval_km: Optional[int] = Field(None, ge=1000, le=100000)
    service_interval_months: Optional[int] = Field(None, ge=1, le=60)
    notes: Optional[str] = Field(None, max_length=2000)

class VehicleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    year: Optional[int] = Field(None, ge=1900, le=2100)
    registration_date: Optional[datetime] = Field(None)
    current_mileage: Optional[int] = Field(None, ge=0)
    purchase_price: Optional[float] = Field(None, ge=0)
    service_interval_km: Optional[int] = Field(None, ge=1000, le=100000)
    service_interval_months: Optional[int] = Field(None, ge=1, le=60)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator('registration_date', mode='before')
    @classmethod
    def parse_registration_date(cls, v):
        if isinstance(v, str) and len(v) == 10:
            return f"{v}T00:00:00"
        return v

# ---------------------------------------------------------------------------
# Interval overrides
# ---------------------------------------------------------------------------
class IntervalOverrideUpdate(BaseModel):
    """
    Surcharge d'intervalle pour une intervention donnée sur un véhicule.
    
    Règles :
    - Si is_km_disabled=True  → km_interval ignoré, critère km désactivé
    - Si is_months_disabled=True → months_interval ignoré, critère temps désactivé
    - km_interval/months_interval=None sans le flag disabled → valeur par défaut du JSON conservée
    """
    km_interval: Optional[int] = Field(None, ge=100, le=500000)
    months_interval: Optional[int] = Field(None, ge=1, le=240)
    is_km_disabled: bool = Field(False)
    is_months_disabled: bool = Field(False)

# ---------------------------------------------------------------------------
# Maintenances
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Fuel logs
# ---------------------------------------------------------------------------
class FuelLogCreate(BaseModel):
    fill_date: str = Field(...)
    mileage_at_fill: int = Field(..., gt=0)
    total_cost: float = Field(..., gt=0)
    price_per_liter: float = Field(..., gt=0)
    station: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)

class FuelLogUpdate(BaseModel):
    fill_date: Optional[str] = None
    mileage_at_fill: Optional[int] = Field(None, gt=0)
    total_cost: Optional[float] = Field(None, gt=0)
    price_per_liter: Optional[float] = Field(None, gt=0)
    station: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)

# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------
class WebhookCreate(BaseModel):
    url: str = Field(..., min_length=10, max_length=500)
    webhook_type: str = Field(
        "discord",
        pattern=r"^discord$",
    )

class WebhookToggle(BaseModel):
    is_active: bool