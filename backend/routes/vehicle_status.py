"""État d'entretien résumé d'un véhicule — compteurs par niveau d'alerte.

La liste des véhicules ne disait rien de leur état : il fallait ouvrir chaque
fiche, ou passer par le tableau de bord, pour savoir qu'un entretien était en
retard. Le calcul vit ici plutôt que dans `routes/vehicles.py` pour que la
question « combien d'alertes sur ce véhicule ? » n'ait qu'une réponse dans le
projet — c'est la même raison qui a fait naître `build_last_maintenances_dict`.

Le chargement est groupé : une requête pour tous les entretiens, une pour tous
les overrides, quel que soit le nombre de véhicules.
"""

from typing import Dict, List

from sqlalchemy.orm import Session

from models import Maintenance, Vehicle, VehicleMaintenanceOverride
from settings_store import get_active_region_code
from maintenance_calculator import MaintenanceCalculator, build_last_maintenances_dict

calculator = MaintenanceCalculator()

# Du plus grave au moins grave — l'ordre sert à désigner le niveau dominant.
SEVERITY = ("overdue", "urgent", "warning")


def alert_counts_for(vehicles: List[Vehicle], db: Session) -> Dict[int, dict]:
    """{vehicle_id: {overdue_count, urgent_count, warning_count, alert_level}}.

    `alert_level` est le niveau le plus grave présent, ou `"ok"`. L'interface
    n'a pas à redériver cette priorité de son côté.
    """
    if not vehicles:
        return {}

    vehicle_ids = [v.id for v in vehicles]

    maintenances = db.query(Maintenance).filter(
        Maintenance.vehicle_id.in_(vehicle_ids)
    ).all()
    by_vehicle: Dict[int, list] = {}
    for m in maintenances:
        by_vehicle.setdefault(m.vehicle_id, []).append(m)

    overrides = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id.in_(vehicle_ids)
    ).all()
    overrides_by_vehicle: Dict[int, dict] = {}
    for o in overrides:
        overrides_by_vehicle.setdefault(o.vehicle_id, {})[o.intervention_key] = o

    result: Dict[int, dict] = {}
    # Pays de l'instance, lu une fois : il sert de repli pour tout véhicule
    # qui ne nomme pas le sien.
    instance_region = get_active_region_code(db)

    for v in vehicles:
        upcoming = calculator.get_all_upcoming_maintenances(
            v.vehicle_type,
            v.current_mileage,
            build_last_maintenances_dict(by_vehicle.get(v.id, [])),
            v.displacement,
            v.year,
            v.registration_date,
            brand=v.brand,
            service_interval_km=v.service_interval_km,
            service_interval_months=v.service_interval_months,
            motorization=v.motorization,
            overrides=overrides_by_vehicle.get(v.id, {}),
            region_code=v.country or instance_region,
        )

        counts = {level: 0 for level in SEVERITY}
        for item in upcoming:
            if item.get("status") in counts:
                counts[item["status"]] += 1

        level = next((s for s in SEVERITY if counts[s] > 0), "ok")
        result[v.id] = {
            "overdue_count": counts["overdue"],
            "urgent_count": counts["urgent"],
            "warning_count": counts["warning"],
            "alert_level": level,
        }

    return result
