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

from models import SessionLocal, Vehicle, Maintenance, NotificationLog
from maintenance_calculator import MaintenanceCalculator, get_intervention_key
from routes.webhooks import send_webhook_notification

logger = logging.getLogger("ridelog.scheduler")
calculator = MaintenanceCalculator()

# Intervals (seconds) – check every hour
CHECK_INTERVAL = 3600


async def _check_vehicle_reminders(vehicle, db):
    """Check a single vehicle for upcoming reminders and send notifications."""
    # Build last maintenance map
    all_maintenances = db.query(Maintenance).filter(
        Maintenance.vehicle_id == vehicle.id
    ).all()

    last_maintenances = {}
    for m in all_maintenances:
        key = get_intervention_key(m.intervention_type)
        current_last = last_maintenances.get(key)
        if current_last is None or m.execution_date > current_last[0]:
            last_maintenances[key] = (m.execution_date, m.mileage_at_intervention)

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
    )

    # Enrich with cost estimates
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
        intervention_key = get_intervention_key(item["intervention_type"])
        km_rem = item.get("km_remaining", 999999)
        days_rem = item.get("days_remaining", 999999)
        status = item.get("status", "ok")

        # ── 3-tier reminder system ──────────────────────────────────
        # Uses raw km_rem / days_rem values only (not the display status)
        # Tier 3 – en retard (due date reached or passed)
        # Tier 2 – à prévoir (≤ 30 days OR ≤ 500 km)
        # Tier 1 – à prévoir (≤ 90 days OR ≤ 1500 km)
        notif_types = []

        if days_rem <= 0 or km_rem <= 0:
            notif_types.append(("tier3_overdue", "overdue"))
        if 0 < days_rem <= 30 or 0 < km_rem <= 500:
            notif_types.append(("tier2_warning", "warning"))
        if 0 < days_rem <= 90 or 0 < km_rem <= 1500:
            notif_types.append(("tier1_warning", "warning"))

        for notif_type, notif_status in notif_types:
            # Check if already sent
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

            # Only record in log if at least one webhook received it
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


async def clear_stale_logs():
    """Deprecated – handled by clear_notification_logs_for()."""
    pass


def clear_notification_logs_for(vehicle_id: int, intervention_type: str, db):
    """Clear notification logs for a specific intervention after it's been done."""
    intervention_key = get_intervention_key(intervention_type)
    db.query(NotificationLog).filter(
        NotificationLog.vehicle_id == vehicle_id,
        NotificationLog.intervention_key == intervention_key,
    ).delete()
    db.commit()


async def scheduler_loop():
    """Background loop that checks reminders periodically."""
    logger.info("Maintenance reminder scheduler started (interval: %ds)", CHECK_INTERVAL)
    # Wait 60s after startup before first check
    await asyncio.sleep(60)

    while True:
        try:
            logger.debug("Running scheduled reminder check …")
            await check_all_reminders()
        except Exception:
            logger.exception("Error in scheduler loop")

        await asyncio.sleep(CHECK_INTERVAL)
