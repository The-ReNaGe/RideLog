"""
Background scheduler that checks all vehicles' upcoming maintenances
and sends webhook notifications with 3 reminder tiers:
  - Tier 1 (à prévoir) : 3 mois / 1 500 km before due  →  "warning"
  - Tier 2 (à prévoir) : 1 mois / 500 km before due    →  "warning"
  - Tier 3 (en retard) : due date reached or passed     →  "overdue"

Runs every hour.  Tracks sent notifications in NotificationLog to avoid spam.
"""

import asyncio
import logging
from datetime import datetime, timezone

from models import SessionLocal, Vehicle, Maintenance, NotificationLog, VehicleMaintenanceOverride
from maintenance_calculator import (
    MaintenanceCalculator,
    build_last_maintenances_dict,
    resolve_intervention_key,
    resolve_sub_intervention_key,
)
from routes.webhooks import send_webhook_notification
from settings_store import get_active_region_code

logger = logging.getLogger("ridelog.scheduler")
calculator = MaintenanceCalculator()

CHECK_INTERVAL = 3600


async def _check_vehicle_reminders(vehicle, db):
    """Check a single vehicle for upcoming reminders and send notifications."""
    all_maintenances = db.query(Maintenance).filter(
        Maintenance.vehicle_id == vehicle.id
    ).all()

    last_maintenances = build_last_maintenances_dict(all_maintenances)

    # Charger les overrides du véhicule
    override_rows = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id == vehicle.id
    ).all()
    vehicle_overrides = {o.intervention_key: o for o in override_rows}

    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle.vehicle_type,
        vehicle.current_mileage,
        last_maintenances,
        vehicle.displacement,
        vehicle.year,
        vehicle.registration_date,
        brand=vehicle.brand,
        service_interval_km=vehicle.service_interval_km,
        service_interval_months=vehicle.service_interval_months,
        motorization=vehicle.motorization,
        overrides=vehicle_overrides,  # ← overrides appliqués
        # Le pays du véhicule décide du calendrier de contrôle technique ;
        # NULL → pays de l'instance.
        region_code=vehicle.country or get_active_region_code(db),
    )

    maint_category = calculator.get_maintenance_category(
        vehicle.vehicle_type, vehicle.brand, vehicle.year
    )

    for item in upcoming:
        cost_est = calculator.get_estimated_cost(
            vehicle.vehicle_type,
            item["intervention_type"],
            vehicle.displacement,
            maint_category,
            brand=vehicle.brand,
            service_interval_km=vehicle.service_interval_km,
            service_interval_months=vehicle.service_interval_months,
        )
        if cost_est:
            item["estimated_cost_min"] = cost_est.get("min")
            item["estimated_cost_max"] = cost_est.get("max")
        else:
            item["estimated_cost_min"] = None
            item["estimated_cost_max"] = None

    for item in upcoming:
        # Les items « à venir » portent déjà leur clé technique : la redériver
        # depuis le libellé affiché rouvrirait la voie à une divergence entre
        # ce qui est calculé et ce qui est journalisé comme notifié.
        intervention_key = item["intervention_key"]
        km_rem = item.get("km_remaining", 999999)
        days_rem = item.get("days_remaining", 999999)

        notif_types = []

        if days_rem <= 0 or km_rem <= 0:
            notif_types.append(("tier3_overdue", "overdue"))
        if 0 < days_rem <= 30 or 0 < km_rem <= 500:
            notif_types.append(("tier2_warning", "warning"))
        if 0 < days_rem <= 90 or 0 < km_rem <= 1500:
            notif_types.append(("tier1_warning", "warning"))

        for notif_type, notif_status in notif_types:
            already_sent = db.query(NotificationLog).filter(
                NotificationLog.vehicle_id == vehicle.id,
                NotificationLog.intervention_key == intervention_key,
                NotificationLog.notification_type == notif_type,
            ).first()

            if already_sent:
                continue

            logger.info(
                "Sending %s notification for %s – %s (km_rem=%s, days_rem=%s)",
                notif_type, vehicle.name, item["intervention_type"], km_rem, days_rem,
            )

            sent = await send_webhook_notification(
                vehicle_name=vehicle.name,
                intervention_type=item["intervention_type"],
                status=notif_status,
                user_id=vehicle.user_id,
                estimated_cost_min=item.get("estimated_cost_min"),
                estimated_cost_max=item.get("estimated_cost_max"),
                db=db,
                km_remaining=km_rem,
                days_remaining=days_rem,
            )

            if sent:
                db.add(NotificationLog(
                    vehicle_id=vehicle.id,
                    intervention_key=intervention_key,
                    notification_type=notif_type,
                ))
                db.commit()
            else:
                logger.debug("No active webhooks – notification not logged for retry")


async def check_all_reminders():
    """Iterate all vehicles and check maintenance reminders."""
    db = SessionLocal()
    try:
        vehicles = db.query(Vehicle).all()
        for vehicle in vehicles:
            try:
                await _check_vehicle_reminders(vehicle, db)
            except Exception:
                logger.exception("Error checking reminders for vehicle %s", vehicle.id)
    finally:
        db.close()


def clear_notification_logs_for(vehicle_id: int, maintenance, db):
    """Efface les rappels déjà envoyés pour une intervention qui vient d'être
    faite, afin qu'un rappel frais reparte au prochain cycle.

    Prend la maintenance elle-même plutôt que son libellé : les clés effacées
    doivent être exactement celles que le calcul d'échéance utilise, sinon un
    rappel « en retard » continue de partir pour un entretien enregistré.
    """
    keys = {resolve_intervention_key(maintenance)}
    for sub in maintenance.sub_interventions or []:
        if isinstance(sub, dict):
            keys.add(resolve_sub_intervention_key(sub))

    db.query(NotificationLog).filter(
        NotificationLog.vehicle_id == vehicle_id,
        NotificationLog.intervention_key.in_([k for k in keys if k]),
    ).delete(synchronize_session=False)
    db.commit()


async def scheduler_loop():
    """Background loop that checks reminders periodically."""
    logger.info("Maintenance reminder scheduler started (interval: %ds)", CHECK_INTERVAL)
    await asyncio.sleep(60)

    while True:
        try:
            logger.debug("Running scheduled reminder check …")
            await check_all_reminders()
        except Exception:
            logger.exception("Error in scheduler loop")

        await asyncio.sleep(CHECK_INTERVAL)