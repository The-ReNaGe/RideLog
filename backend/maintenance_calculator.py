import json
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from typing import Optional, Dict, List, Tuple
from pathlib import Path


INTERVENTION_ALIASES = {
    "vidange_d'huile": "oil_change",
    "remplacement_filtre_à_air": "air_filter",
    "remplacement_filtre_d'habitacle": "cabin_filter",
    "purge_de_frein": "brake_fluid",
    "remplacement_courroie_de_distribution": "timing_belt",
    "renouvellement_liquide_de_refroidissement": "coolant",
    "renouvellement_liquide_de_transmission": "transmission_fluid",
    "remplacement_plaquettes_de_frein": "brake_pads",
    "remplacement_batterie": "battery",
    "contrôle_technique": "mot_inspection",
    "remplacement_bougie_d'allumage": "spark_plug",
    "lubrification_chaîne": "chain_lubrication",
    "inspection_pneus": "tire_inspection",
    "remplacement_chaîne": "chain_replacement",
    "remplacement_pneus": "tire_replacement",
    "tension_et_lubrification_chaîne": "chain_maintenance",
    "révision_fourche": "fork_service",
    "remplacement_disques_de_frein": "brake_disc_replacement",
    "nettoyage_carburateur": "carburetor_cleaning",
    "synchronisation_injection": "injection_sync",
    "diagnostic_électronique": "electronic_diagnosis",
    "remplacement_kit_chaîne_(chaîne_+_pignon_+_couronne)": "chain_kit",
}

# French label → technical key mapping (used in routes/maintenances.py and scheduler)
INTERVENTION_TRANSLATIONS = {
    # Moteur / Engine
    "Vidange d'huile": "oil_change",
    "Vidange d'huile + filtre": "oil_change",
    "Vidange d'huile (entretien 4000km)": "oil_change",
    "Vidange d'huile (entretien 6000km)": "oil_change",
    "Vidange d'huile (entretien 10000km)": "oil_change",
    "Vidange d'huile (entretien 10-12000km)": "oil_change",
    "Remplacement filtre à huile": "oil_filter",
    "Remplacement bougie d'allumage": "spark_plug",
    "Remplacement bougies d'allumage": "spark_plug",
    "Remplacement filtre à air": "air_filter",
    "Remplacement filtre d'habitacle": "cabin_filter",
    "Remplacement filtre à carburant": "fuel_filter_diesel",
    
    # Transmission / Chain
    "Remplacement kit chaîne (chaîne + pignon + couronne)": "chain_kit",
    "Vérification et ajustement tension chaîne": "chain_tension",
    "Graissage de chaîne": "chain_lubrication",
    "Nettoyage chaîne": "chain_cleaning",
    "Tension et lubrification chaîne": "chain_maintenance",
    
    # Tires
    "Remplacement pneu arrière": "tire_replacement_rear",
    "Remplacement pneu avant": "tire_replacement_front",
    "Remplacement pneus": "tire_replacement",
    "Remplacement pneus (paire)": "tire_replacement",
    
    # Braking
    "Purge de frein": "brake_fluid",
    "Purge circuit de freinage": "brake_fluid",
    "Remplacement plaquettes de frein": "brake_pads",
    "Remplacement plaquettes (avant ou arrière)": "brake_pads",
    "Remplacement disques de frein": "brake_disc",
    "Remplacement disques": "brake_disc",
    
    # Electrical
    "Remplacement batterie": "battery",
    
    # Cooling
    "Renouvellement liquide de refroidissement": "coolant",
    "Renouvellement liquide refroidissement": "coolant",
    
    # Transmission Fluid
    "Renouvellement liquide de transmission": "transmission_fluid",
    "Renouvellement huile transmission": "transmission_fluid",
    
    # Suspension
    "Révision fourche (vidange + joints)": "fork_service",
    "Vidange fourche": "fork_service",
    
    # Regular checks
    "Contrôle et ajustement jeu aux soupapes": "valve_clearance",
    "Contrôle jeu aux soupapes": "valve_clearance",
    "Jeu aux soupapes": "valve_clearance",
    "Vérification et serrage visserie": "fastener_tightening",
    "Serrage visserie": "fastener_tightening",
    "Graissage câbles (embrayage/accélérateur)": "cable_greasing",
    "Graissage câbles": "cable_greasing",
    "Contrôle roulements de roue": "wheel_bearings",
    "Roulements de roue": "wheel_bearings",
    "Remplacement roulements de roue": "wheel_bearings",
    "Contrôle roulements de direction": "steering_bearings",
    "Roulements de direction": "steering_bearings",
    "Remplacement roulements de direction": "steering_bearings",
    "Contrôle roulements de bras oscillant": "swingarm_bearings",
    "Roulements de bras oscillant": "swingarm_bearings",
    "Contrôle durites et flexibles": "hose_check",
    "Durites": "hose_check",
    
    # Carburation / Injection
    "Nettoyage carburateur": "carburetor_cleaning",
    "Nettoyage carburateur(s)": "carburetor_cleaning",
    "Synchronisation injection": "injection_sync",
    "Diagnostic électronique": "electronic_diagnosis",
    "Diagnostic électronique (valise)": "electronic_diagnosis",
    
    # Services réguliers et inspections
    "Révision rodage (fin de rodage)": "break_in_service",
    "Révision rodage (1000 km)": "break_in_service",
    "Révision périodique (km)": "periodic_service",
    "Révision périodique (entretien)": "periodic_service",
    "Entretien annuel": "annual_service",
    "Contrôle technique": "inspection_technical_car",
    
    # Fluids (moto-specific names)
    "Purge liquide de frein et embrayage": "brake_fluid",
    "Remplacement liquide de refroidissement": "coolant",
    "Remplacement huile de transmission": "transmission_fluid",
    "Remplacement courroie de distribution": "timing_belt",
    "Tension et graissage chaîne": "chain_maintenance",
    
    # Fuel filter (motorization-specific)
    "Remplacement filtre à gasoil": "fuel_filter_diesel",
    "Remplacement filtre à essence": "fuel_filter_gasoline",
}

# ✋ Consommables: Excluded from "À venir" forecast because too variable
# For cars, this set is still used. For motorcycles, the JSON structure separates forecasted/recordable.
CONSUMABLES = {
    "tire_replacement",      # Pneus
    "tire_replacement_front", # Pneu avant
    "tire_replacement_rear",  # Pneu arrière
    "tire_inspection",       # Inspection pneus
    "spark_plug",            # Bougies d'allumage
    "chain_replacement",     # Chaîne
    "chain_kit",            # Kit chaîne complet
    "chain_cleaning",       # Nettoyage chaîne
    "chain_lubrication",    # Graissage chaîne
    "brake_pads",            # Plaquettes de frein
    "brake_disc",           # Disques de frein
    "brake_disc_replacement", # Disques de frein
    "battery",               # Batterie
    "oil_filter",           # Filtre à huile
    "fastener_tightening",  # Serrage visserie
    "cable_greasing",       # Graissage câbles
    "wheel_bearings",       # Roulements de roue
    "steering_bearings",    # Roulements de direction
    "swingarm_bearings",    # Roulements bras oscillant
    "hose_check",           # Contrôle durites
}


def get_intervention_key(name: str) -> str:
    """Normalise a French intervention label to an internal key."""
    normalized = (name or "").strip()
    if normalized in INTERVENTION_TRANSLATIONS:
        return INTERVENTION_TRANSLATIONS[normalized]

    lowered = normalized.lower()
    for fr_name, key in INTERVENTION_TRANSLATIONS.items():
        if lowered == fr_name.lower():
            return key

    return lowered.replace(" ", "_")


class MaintenanceCalculator:
    """Calculate maintenance status and forecasts based on intervals and history."""

    def __init__(self):
        self.intervals_path = Path(__file__).parent / "data" / "maintenance_intervals.json"
        self.brands_path = Path(__file__).parent / "data" / "brands.json"
        with open(self.intervals_path) as f:
            self.intervals_data = json.load(f)
        with open(self.brands_path) as f:
            self.brands_data = json.load(f)

    def _get_displacement_tier(self, displacement: Optional[int]) -> str:
        """Map displacement to a tier key for service_prices lookup."""
        if displacement is None or displacement <= 125:
            return "125cc"
        elif displacement <= 400:
            return "200_400cc"
        elif displacement <= 750:
            return "500_750cc"
        elif displacement <= 1100:
            return "750_1100cc"
        else:
            return "1100_plus"

    def get_brand_service_interval(self, brand: str, displacement: Optional[int] = None) -> Dict:
        """Get default service interval (km + months) for a brand and displacement.
        Returns: {"km": int, "months": int}
        """
        moto_data = self.intervals_data["maintenance_intervals"]["motorcycle"]
        brand_defaults = moto_data.get("brand_defaults", {})
        
        # Try exact brand match first
        intervals = brand_defaults.get(brand)
        if not intervals:
            # Try case-insensitive match
            for key, val in brand_defaults.items():
                if key.startswith("_"):
                    continue
                if key.lower() == (brand or "").lower():
                    intervals = val
                    break
        if not intervals:
            intervals = brand_defaults.get("_default", [{"max_cc": 99999, "km": 10000, "months": 12}])
        
        cc = displacement or 0
        for rule in intervals:
            if cc <= rule.get("max_cc", 99999):
                return {"km": rule["km"], "months": rule["months"]}
        
        # Fallback
        return {"km": 10000, "months": 12}

    def get_intervals_for_vehicle(
        self,
        vehicle_type: str,
        displacement: Optional[int] = None,
        brand: Optional[str] = None,
        service_interval_km: Optional[int] = None,
        service_interval_months: Optional[int] = None,
    ) -> Dict:
        """Get maintenance intervals for a specific vehicle as a flat dict.
        
        For cars: returns the car section as-is.
        For motorcycles: merges forecasted + recordable sections, with the
        periodic_service interval set from brand defaults or user override.
        """
        if vehicle_type == "car":
            return self.intervals_data["maintenance_intervals"]["car"]

        if vehicle_type == "motorcycle":
            moto_data = self.intervals_data["maintenance_intervals"]["motorcycle"]
            
            # Determine service interval
            brand_default = self.get_brand_service_interval(brand, displacement)
            effective_km = service_interval_km or brand_default["km"]
            # Get price for the periodic_service based on displacement tier
            tier = self._get_displacement_tier(displacement)
            service_prices = moto_data.get("service_prices", {}).get(tier, {})
            annual_prices = moto_data.get("annual_service_prices", {}).get(tier, {})
            
            # Build flat dict: forecasted items + recordable items
            result = {}
            
            # Add forecasted items
            for key, info in moto_data.get("forecasted", {}).items():
                if key.startswith("_"):
                    continue
                entry = dict(info)
                entry["forecasted"] = True
                
                # Special: set periodic_service interval dynamically (km only)
                if key == "periodic_service":
                    entry["km_interval"] = effective_km
                    entry["months_interval"] = None  # km-based only
                    entry["prices"] = service_prices
                
                # Special: set annual_service prices dynamically
                elif key == "annual_service":
                    entry["prices"] = annual_prices
                
                # Special: valve_clearance = 2× service interval
                elif key == "valve_clearance":
                    entry["km_interval"] = effective_km * 2
                
                result[key] = entry
            
            # Add recordable items (not forecasted)
            for key, info in moto_data.get("recordable", {}).items():
                if key.startswith("_"):
                    continue
                entry = dict(info)
                entry["forecasted"] = False
                result[key] = entry
            
            return result

        return {}

    def calculate_inspection_technical_date(
        self,
        vehicle_type: str,
        registration_date: Optional[datetime],
        last_inspection_date: Optional[datetime],
    ) -> Optional[datetime]:
        """
        Calculate the next inspection technical date based on French regulations.
        
        MOTOS (Category L):
        - 2020-2021: 1st between 2026, max 4 months after anniversary, latest 31 Dec 2026
        - 2022+: 1st between 6 months before and 5th anniversary
        - Following: Every 3 years
        
        CARS:
        - 1st between 6 months before and 4th anniversary
        - Following: Every 2 years
        """
        if not registration_date:
            return None
        
        today = datetime.utcnow()
        reg_year = registration_date.year
        
        if vehicle_type == "motorcycle":
            # If 1st inspection hasn't been done yet
            if last_inspection_date is None:
                if reg_year in (2020, 2021):
                    # 1st CT in 2026: 5th anniversary + max 4 months after, limit 31 Dec 2026
                    fifth_anniversary = registration_date + relativedelta(years=5)
                    four_months_after = fifth_anniversary + relativedelta(months=4)
                    latest = datetime(2026, 12, 31)
                    return min(four_months_after, latest)
                elif reg_year >= 2022:
                    # 1st CT: between 6 months before and 5th anniversary
                    fifth_anniversary = registration_date + relativedelta(years=5)
                    # Due between (5 years - 6 months) and (5 years)
                    # For display, show the end of the window
                    return fifth_anniversary
                else:
                    # Older bikes (2019 and before) - already should have had their CT
                    return None
            else:
                # Subsequent inspections: every 3 years
                return last_inspection_date + relativedelta(years=3)
        
        elif vehicle_type == "car":
            # If 1st inspection hasn't been done yet
            if last_inspection_date is None:
                # 1st CT: 4th anniversary + 6 months (same logic as motorcycle but with 4 years and 6 months instead of 5 years and 4 months)
                fourth_anniversary = registration_date + relativedelta(years=4)
                six_months_after = fourth_anniversary + relativedelta(months=6)
                return six_months_after
            else:
                # Subsequent inspections: every 2 years
                return last_inspection_date + relativedelta(years=2)
        
        return None

    def calculate_maintenance_status(
        self,
        last_maintenance_date: Optional[datetime],
        last_maintenance_mileage: Optional[int],
        current_mileage: int,
        km_interval: Optional[int],
        months_interval: Optional[int],
        condition_based: bool = False,
        reference_start_date: Optional[datetime] = None,
    ) -> Tuple[str, int, int, Optional[int], Optional[datetime]]:
        """
        Calculate the status and remaining time/distance for a maintenance item.
        Returns: (status, km_remaining, days_remaining, next_due_mileage, next_due_date)
        status: 'overdue' | 'urgent' | 'warning' | 'ok'
        """
        today = datetime.utcnow()  # naive UTC to match naive DB dates

        if condition_based:
            return "ok", 999999, 999999, None, None

        km_remaining = float('inf')
        days_remaining = float('inf')
        next_due_mileage = None
        next_due_date = None

        # Calculate km remaining
        if km_interval is not None and last_maintenance_mileage is not None:
            raw_next = last_maintenance_mileage + km_interval
            # Snap to nearest grid multiple to prevent cumulative drift
            # e.g. done at 10500 with 10000 interval → next = 20000, not 20500
            remainder = raw_next % km_interval
            if remainder <= km_interval // 2:
                next_due_mileage = raw_next - remainder
            else:
                next_due_mileage = raw_next - remainder + km_interval
            km_remaining = next_due_mileage - current_mileage
        else:
            km_remaining = float('inf')

        # Calculate days remaining
        schedule_start_date = last_maintenance_date or reference_start_date
        if months_interval is not None and schedule_start_date is not None:
            due_date = schedule_start_date + relativedelta(months=months_interval)
            next_due_date = due_date
            days_remaining = (due_date - today).days
        else:
            days_remaining = float('inf')

        km_finite = km_remaining != float('inf')
        days_finite = days_remaining != float('inf')

        if (km_finite and km_remaining < 0) or (days_finite and days_remaining < 0):
            status = "overdue"
        elif (km_finite and km_remaining <= 300) or (days_finite and days_remaining <= 7):
            status = "urgent"
        elif (km_finite and km_remaining <= 1500) or (days_finite and days_remaining <= 90):
            status = "warning"
        else:
            status = "ok"

        # Convert infinity to 999999 for display
        km_remaining = 999999 if km_remaining == float('inf') else int(km_remaining)
        days_remaining = 999999 if days_remaining == float('inf') else int(days_remaining)

        return status, km_remaining, days_remaining, next_due_mileage, next_due_date

    def auto_categorize_vehicle(
        self, brand: str, year: int, purchase_price: Optional[float] = None, vehicle_type: str = "car"
    ) -> str:
        """
        Intelligently categorize a vehicle based on brand, year, and price.
        Returns: 'accessible' | 'generalist' | 'premium'
        """
        current_year = datetime.now(timezone.utc).year
        age = current_year - year

        # Get base category from brand (this is the PRIMARY determinant)
        brands_data = self.brands_data["brands"].get(vehicle_type, {})
        base_category = "generalist"  # default

        for category, brands_list in brands_data.items():
            if any(b.lower() in brand.lower() for b in brands_list):
                base_category = category
                break

        # Use price as a secondary check to escalate OR slightly demote if VERY old
        if purchase_price is not None:
            # Different price thresholds for cars vs motorcycles
            if vehicle_type == "motorcycle":
                # Motorcycles: different scale
                # < 3000€ = accessible, 3000-8000€ = generalist, > 8000€ = premium
                if purchase_price > 8000 and base_category != "premium":
                    base_category = "premium"
                elif purchase_price < 2000 and base_category == "premium" and age > 8:
                    base_category = "generalist"
            else:
                # Cars: standard scale
                # < 8000€ = accessible, 8000-35000€ = generalist, > 35000€ = premium
                if purchase_price > 35000 and base_category != "premium":
                    base_category = "premium"
                elif purchase_price < 5000 and base_category == "premium" and age > 8:
                    base_category = "generalist"

        # Adjust category based on age
        year_adjustments = self.brands_data["year_adjustment"]["rules"]
        adjustment = 1.0
        for rule in year_adjustments:
            if rule["years_min"] <= age <= rule["years_max"]:
                adjustment = rule["adjustment"]
                break

        # Apply adjustment only for extreme age + premium
        if base_category == "premium" and adjustment < 0.7 and age > 12:
            return "generalist"

        return base_category

    def get_maintenance_category(
        self, vehicle_type: str, brand: str, year: int
    ) -> str:
        """
        Determine maintenance cost category based on brand and age.
        Older vehicles in premium brands -> generalist
        Newer vehicles in accessible brands -> accessible
        """
        current_year = datetime.now(timezone.utc).year
        age = current_year - year

        # Get base category from brand
        brands_data = self.brands_data["brands"].get(vehicle_type, {})
        base_category = "generalist"  # default

        for category, brands_list in brands_data.items():
            if any(b.lower() in brand.lower() for b in brands_list):
                base_category = category
                break

        # Adjust category based on age
        year_adjustments = self.brands_data["year_adjustment"]["rules"]
        adjustment = 1.0
        for rule in year_adjustments:
            if rule["years_min"] <= age <= rule["years_max"]:
                adjustment = rule["adjustment"]
                break

        # Apply adjustment
        if base_category == "premium":
            # Premium cars get cheaper as they age
            if adjustment < 1.0:
                return "generalist" if adjustment < 0.8 else "premium"
        elif base_category == "accessible":
            # Accessible cars stay accessible
            return "accessible"

        return base_category

    def get_estimated_cost(
        self,
        vehicle_type: str,
        intervention_type: str,
        displacement: Optional[int] = None,
        range_category: str = "generalist",
        brand: Optional[str] = None,
        service_interval_km: Optional[int] = None,
        service_interval_months: Optional[int] = None,
    ) -> Optional[Dict]:
        """Get estimated cost for a maintenance intervention."""
        intervals = self.get_intervals_for_vehicle(
            vehicle_type, displacement, brand, service_interval_km, service_interval_months
        )

        normalized = intervention_type.lower().replace(" ", "_")
        normalized = INTERVENTION_ALIASES.get(normalized, normalized)
        if normalized in intervals:
            item = intervals[normalized]
            prices = item.get("prices", {})
            # For motorcycle periodic_service, prices are already per range_category
            if isinstance(prices, dict) and range_category in prices:
                return prices[range_category]
            elif isinstance(prices, dict) and "min" in prices:
                # Flat price dict (no categories) - e.g. motorcycle service_prices
                return prices
            return None

        for key, info in intervals.items():
            if not isinstance(info, dict) or "name" not in info:
                continue
            if (info.get("name") or "").strip().lower() == intervention_type.strip().lower():
                prices = info.get("prices", {})
                if isinstance(prices, dict) and range_category in prices:
                    return prices[range_category]
                return None

        return None

    def get_all_upcoming_maintenances(
        self,
        vehicle_type: str,
        current_mileage: int,
        last_maintenances: Dict[str, Tuple[Optional[datetime], Optional[int]]],
        displacement: Optional[int] = None,
        vehicle_year: Optional[int] = None,
        registration_date: Optional[datetime] = None,
        brand: Optional[str] = None,
        service_interval_km: Optional[int] = None,
        service_interval_months: Optional[int] = None,
        motorization: Optional[str] = None,
    ) -> List[Dict]:
        """Get all upcoming maintenances for a vehicle, sorted by urgency.
        
        For cars: uses CONSUMABLES set to exclude variable items.
        For motorcycles: uses the 'forecasted' flag from the new JSON structure.
        """
        intervals = self.get_intervals_for_vehicle(
            vehicle_type, displacement, brand, service_interval_km, service_interval_months
        )
        upcoming = []

        for intervention_key, interval_info in intervals.items():
            # Skip non-intervention keys like "description", "_note"
            if not isinstance(interval_info, dict) or "name" not in interval_info:
                continue
            
            # Skip non-forecasted items
            if not interval_info.get("forecasted", False):
                continue
            
            # Skip items restricted to a specific motorization
            allowed_motorizations = interval_info.get("motorization")
            if allowed_motorizations and motorization and motorization not in allowed_motorizations:
                continue

            
            last_date, last_mileage = last_maintenances.get(intervention_key, (None, None))

            # Special handling for inspection_technical_car and inspection_technical_moto
            if intervention_key in ("inspection_technical_car", "inspection_technical_moto"):
                # For motorcycles, try to find last_date from both inspection_technical_moto and inspection_technical_car
                # (legacy systems may have stored as inspection_technical_car for all vehicles)
                last_date = None
                if vehicle_type == "motorcycle":
                    last_date_moto = last_maintenances.get("inspection_technical_moto", (None, None))[0]
                    last_date_car = last_maintenances.get("inspection_technical_car", (None, None))[0]
                    if last_date_moto and last_date_car:
                        last_date = max(last_date_moto, last_date_car)
                    elif last_date_moto:
                        last_date = last_date_moto
                    elif last_date_car:
                        last_date = last_date_car
                else:
                    # For cars, also try both keys just in case
                    last_date_moto = last_maintenances.get("inspection_technical_moto", (None, None))[0]
                    last_date_car = last_maintenances.get("inspection_technical_car", (None, None))[0]
                    if last_date_moto and last_date_car:
                        last_date = max(last_date_moto, last_date_car)
                    elif last_date_moto:
                        last_date = last_date_moto
                    elif last_date_car:
                        last_date = last_date_car
                    else:
                        last_date = None
                
                next_due_date = self.calculate_inspection_technical_date(
                    vehicle_type,
                    registration_date,
                    last_date,
                )
                
                if next_due_date:
                    today = datetime.utcnow()
                    days_remaining = (next_due_date - today).days
                    
                    if days_remaining < 0:
                        status = "overdue"
                    elif days_remaining <= 7:
                        status = "urgent"
                    elif days_remaining <= 90:
                        status = "warning"
                    else:
                        status = "ok"
                else:
                    status = "ok"
                    next_due_date = None
                    days_remaining = 999999
                
                upcoming.append({
                    "intervention_type": interval_info["name"],
                    "status": status,
                    "km_remaining": 999999,
                    "days_remaining": days_remaining if days_remaining != 999999 else 999999,
                    "next_due_mileage": None,
                    "next_due_date": next_due_date.isoformat() if next_due_date else None,
                    "km_interval": None,
                    "months_interval": None,
                    "condition_based": False,
                    "never_recorded": last_date is None,
                })
                continue
            
            # Standard maintenance calculation
            km_interval = interval_info.get("km_interval")
            months_interval = interval_info.get("months_interval")
            condition_based = bool(interval_info.get("condition_based", False))

            if km_interval is not None and last_mileage is None:
                last_mileage = 0

            reference_start_date = None
            if months_interval is not None and last_date is None:
                # Use the earliest known date as baseline (handles used vehicles correctly)
                candidates = []
                if registration_date:
                    candidates.append(registration_date)
                if vehicle_year:
                    safe_year = min(max(int(vehicle_year), 1970), datetime.now(timezone.utc).year)
                    candidates.append(datetime(safe_year, 1, 1))
                if candidates:
                    reference_start_date = min(candidates)

            status, km_remaining, days_remaining, next_due_mileage, next_due_date = self.calculate_maintenance_status(
                last_date,
                last_mileage,
                current_mileage,
                km_interval,
                months_interval,
                condition_based=condition_based,
                reference_start_date=reference_start_date,
            )

            upcoming.append({
                "intervention_type": interval_info["name"],
                "status": status,
                "km_remaining": km_remaining,
                "days_remaining": days_remaining,
                "next_due_mileage": next_due_mileage,
                "next_due_date": next_due_date.isoformat() if next_due_date else None,
                "km_interval": km_interval,
                "months_interval": months_interval,
                "condition_based": condition_based,
                "never_recorded": last_date is None and last_mileage is None,
            })

        # Sort by urgency: overdue first, then by closest deadline
        upcoming.sort(key=lambda x: (
            {"overdue": 0, "urgent": 1, "warning": 2, "ok": 3}[x["status"]],
            min(
                x["km_remaining"] if x["km_remaining"] != 999999 else 10**9,
                x["days_remaining"] if x["days_remaining"] != 999999 else 10**9,
            )
        ))

        return upcoming


calculator = MaintenanceCalculator()
