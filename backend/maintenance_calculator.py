import json
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from typing import Optional, Dict, List, Tuple
from pathlib import Path


INTERVENTION_ALIASES = {
    "vidange_d'huile": "oil_change",
    "Vidange d'huile + Remplacement filtre à huile": "oil_change_moto",
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
    "Vidange d'huile + Remplacement filtre à huile": "oil_change_moto",
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
    "Purge liquide de frein et embrayage": "brake_fluid",   # ancien nom — conserver pour BDD existante
    "Remplacement liquide de frein": "brake_fluid",          # nouveau nom
    "Remplacement liquide de refroidissement": "coolant",
    "Remplacement huile de transmission": "transmission_fluid",
    "Remplacement courroie de distribution": "timing_belt",
    "Tension et graissage chaîne": "chain_maintenance",
    
    # Fuel filter (motorization-specific)
    "Remplacement filtre à gasoil": "fuel_filter_diesel",
    "Remplacement filtre à essence": "fuel_filter_gasoline",
}

# ✋ Consommables: Excluded from "À venir" forecast because too variable
CONSUMABLES = {
    "tire_replacement",
    "tire_replacement_front",
    "tire_replacement_rear",
    "tire_inspection",
    "spark_plug",
    "chain_replacement",
    "chain_kit",
    "chain_cleaning",
    "chain_lubrication",
    "brake_pads",
    "brake_disc",
    "brake_disc_replacement",
    "battery",
    "oil_filter",
    "fastener_tightening",
    "cable_greasing",
    "wheel_bearings",
    "steering_bearings",
    "swingarm_bearings",
    "hose_check",
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
        """Get default service interval (km + months) for a brand and displacement."""
        moto_data = self.intervals_data["maintenance_intervals"]["motorcycle"]
        brand_defaults = moto_data.get("brand_defaults", {})
        
        intervals = brand_defaults.get(brand)
        if not intervals:
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
        
        return {"km": 10000, "months": 12}

    def get_intervals_for_vehicle(
        self,
        vehicle_type: str,
        displacement: Optional[int] = None,
        brand: Optional[str] = None,
        service_interval_km: Optional[int] = None,
        service_interval_months: Optional[int] = None,
    ) -> Dict:
        """Get maintenance intervals for a specific vehicle as a flat dict."""
        if vehicle_type == "car":
            return self.intervals_data["maintenance_intervals"]["car"]

        if vehicle_type == "motorcycle":
            moto_data = self.intervals_data["maintenance_intervals"]["motorcycle"]
            
            brand_default = self.get_brand_service_interval(brand, displacement)
            effective_km = service_interval_km or brand_default["km"]
            tier = self._get_displacement_tier(displacement)
            service_prices = moto_data.get("service_prices", {}).get(tier, {})
            annual_prices = moto_data.get("annual_service_prices", {}).get(tier, {})
            
            result = {}
            
            for key, info in moto_data.get("forecasted", {}).items():
                if key.startswith("_"):
                    continue
                entry = dict(info)
                entry["forecasted"] = True
                
                if key == "periodic_service":
                    entry["km_interval"] = effective_km
                    entry["months_interval"] = None
                    entry["prices"] = service_prices
                elif key == "annual_service":
                    entry["prices"] = annual_prices
                elif key == "valve_clearance":
                    entry["km_interval"] = effective_km * 2
                elif key == "oil_change":
                    entry["km_interval"] = effective_km
                    # months_interval = 12 déjà dans le JSON

                result[key] = entry
            
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
        """Calculate the next inspection technical date based on French regulations."""
        if not registration_date:
            return None
        
        today = datetime.utcnow()
        reg_year = registration_date.year
        
        if vehicle_type == "motorcycle":
            if last_inspection_date is None:
                if reg_year in (2020, 2021):
                    fifth_anniversary = registration_date + relativedelta(years=5)
                    four_months_after = fifth_anniversary + relativedelta(months=4)
                    latest = datetime(2026, 12, 31)
                    return min(four_months_after, latest)
                elif reg_year >= 2022:
                    fifth_anniversary = registration_date + relativedelta(years=5)
                    return fifth_anniversary
                else:
                    return None
            else:
                return last_inspection_date + relativedelta(years=3)
        
        elif vehicle_type == "car":
            if last_inspection_date is None:
                fourth_anniversary = registration_date + relativedelta(years=4)
                six_months_after = fourth_anniversary + relativedelta(months=6)
                return six_months_after
            else:
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
        """Calculate the status and remaining time/distance for a maintenance item."""
        today = datetime.utcnow()

        if condition_based:
            return "ok", 999999, 999999, None, None

        km_remaining = float('inf')
        days_remaining = float('inf')
        next_due_mileage = None
        next_due_date = None

        if km_interval is not None and last_maintenance_mileage is not None:
            next_due_mileage = last_maintenance_mileage + km_interval
            km_remaining = next_due_mileage - current_mileage
        else:
            km_remaining = float('inf')

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

        km_remaining = 999999 if km_remaining == float('inf') else int(km_remaining)
        days_remaining = 999999 if days_remaining == float('inf') else int(days_remaining)

        return status, km_remaining, days_remaining, next_due_mileage, next_due_date

    def auto_categorize_vehicle(
        self, brand: str, year: int, purchase_price: Optional[float] = None, vehicle_type: str = "car"
    ) -> str:
        """Intelligently categorize a vehicle based on brand, year, and price."""
        current_year = datetime.now(timezone.utc).year
        age = current_year - year

        brands_data = self.brands_data["brands"].get(vehicle_type, {})
        base_category = "generalist"

        for category, brands_list in brands_data.items():
            if any(b.lower() in brand.lower() for b in brands_list):
                base_category = category
                break

        if purchase_price is not None:
            if vehicle_type == "motorcycle":
                if purchase_price > 8000 and base_category != "premium":
                    base_category = "premium"
                elif purchase_price < 2000 and base_category == "premium" and age > 8:
                    base_category = "generalist"
            else:
                if purchase_price > 35000 and base_category != "premium":
                    base_category = "premium"
                elif purchase_price < 5000 and base_category == "premium" and age > 8:
                    base_category = "generalist"

        year_adjustments = self.brands_data["year_adjustment"]["rules"]
        adjustment = 1.0
        for rule in year_adjustments:
            if rule["years_min"] <= age <= rule["years_max"]:
                adjustment = rule["adjustment"]
                break

        if base_category == "premium" and adjustment < 0.7 and age > 12:
            return "generalist"

        return base_category

    def get_maintenance_category(
        self, vehicle_type: str, brand: str, year: int
    ) -> str:
        """Determine maintenance cost category based on brand and age."""
        current_year = datetime.now(timezone.utc).year
        age = current_year - year

        brands_data = self.brands_data["brands"].get(vehicle_type, {})
        base_category = "generalist"

        for category, brands_list in brands_data.items():
            if any(b.lower() in brand.lower() for b in brands_list):
                base_category = category
                break

        year_adjustments = self.brands_data["year_adjustment"]["rules"]
        adjustment = 1.0
        for rule in year_adjustments:
            if rule["years_min"] <= age <= rule["years_max"]:
                adjustment = rule["adjustment"]
                break

        if base_category == "premium":
            if adjustment < 1.0:
                return "generalist" if adjustment < 0.8 else "premium"
        elif base_category == "accessible":
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
            if isinstance(prices, dict) and range_category in prices:
                return prices[range_category]
            elif isinstance(prices, dict) and "min" in prices:
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
        overrides: Optional[Dict] = None,
    ) -> List[Dict]:
        """Get all upcoming maintenances for a vehicle, sorted by urgency.
        
        overrides: dict {intervention_key: VehicleMaintenanceOverride}
                   Surcharges par véhicule qui priment sur les intervalles du JSON.
                   Passé depuis _compute_upcoming() dans routes/maintenances.py.
        """
        intervals = self.get_intervals_for_vehicle(
            vehicle_type, displacement, brand, service_interval_km, service_interval_months
        )

        # ── Appliquer les surcharges d'intervalles par véhicule ──
        # On travaille sur une copie pour ne pas muter le dict retourné par get_intervals_for_vehicle
        if overrides:
            intervals = dict(intervals)  # shallow copy du niveau supérieur
            for key, override in overrides.items():
                if key not in intervals:
                    continue
                entry = dict(intervals[key])  # copie de l'entrée
                if override.is_km_disabled:
                    entry["km_interval"] = None
                elif override.km_interval is not None:
                    entry["km_interval"] = override.km_interval
                if override.is_months_disabled:
                    entry["months_interval"] = None
                elif override.months_interval is not None:
                    entry["months_interval"] = override.months_interval
                entry["has_override"] = True
                intervals[key] = entry

        upcoming = []

        for intervention_key, interval_info in intervals.items():
            if not isinstance(interval_info, dict) or "name" not in interval_info:
                continue
            
            if not interval_info.get("forecasted", False):
                continue
            
            allowed_motorizations = interval_info.get("motorization")
            if allowed_motorizations and motorization and motorization not in allowed_motorizations:
                continue

            last_date, last_mileage = last_maintenances.get(intervention_key, (None, None))

            # Logique spéciale annual_service : date de référence = max des interventions majeures
            if intervention_key == "annual_service":
                MAJOR_SERVICE_KEYS = {
                    "annual_service",
                    "periodic_service",
                    "oil_change_moto",
                    "valve_clearance",
                }
                candidates = [
                    last_maintenances[k]
                    for k in MAJOR_SERVICE_KEYS
                    if k in last_maintenances and last_maintenances[k] != (None, None)
                ]
                if candidates:
                    best = max(candidates, key=lambda r: r[0] if r[0] is not None else datetime.min)
                    last_date, last_mileage = best

            # Logique spéciale contrôle technique
            if intervention_key in ("inspection_technical_car", "inspection_technical_moto"):
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
                    "intervention_key": intervention_key,
                    "status": status,
                    "km_remaining": 999999,
                    "days_remaining": days_remaining if days_remaining != 999999 else 999999,
                    "next_due_mileage": None,
                    "next_due_date": next_due_date.isoformat() if next_due_date else None,
                    "km_interval": None,
                    "months_interval": None,
                    "condition_based": False,
                    "never_recorded": last_date is None,
                    "has_override": interval_info.get("has_override", False),
                })
                continue
            
            # Calcul standard
            km_interval = interval_info.get("km_interval")
            months_interval = interval_info.get("months_interval")
            condition_based = bool(interval_info.get("condition_based", False))

            if km_interval is not None and last_mileage is None:
                last_mileage = 0

            reference_start_date = None
            if months_interval is not None and last_date is None:
                if registration_date:
                    # Priorité absolue à la MEC — date exacte connue
                    reference_start_date = registration_date
                elif vehicle_year:
                    # Fallback : seulement si pas de MEC, on prend le 1er janvier de l'année
                    safe_year = min(max(int(vehicle_year), 1970), datetime.now(timezone.utc).year)
                    reference_start_date = datetime(safe_year, 1, 1)

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
                "intervention_key": intervention_key,   # ← ajouté pour que l'UI puisse identifier l'item
                "status": status,
                "km_remaining": km_remaining,
                "days_remaining": days_remaining,
                "next_due_mileage": next_due_mileage,
                "next_due_date": next_due_date.isoformat() if next_due_date else None,
                "km_interval": km_interval,
                "months_interval": months_interval,
                "condition_based": condition_based,
                "never_recorded": last_date is None and last_mileage is None,
                "has_override": interval_info.get("has_override", False),
            })

        upcoming.sort(key=lambda x: (
            {"overdue": 0, "urgent": 1, "warning": 2, "ok": 3}[x["status"]],
            min(
                x["km_remaining"] if x["km_remaining"] != 999999 else 10**9,
                x["days_remaining"] if x["days_remaining"] != 999999 else 10**9,
            )
        ))

        return upcoming


calculator = MaintenanceCalculator()