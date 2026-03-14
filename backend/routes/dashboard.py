"""Dashboard API – aggregated stats across all user vehicles."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import Vehicle, Maintenance, FuelLog, User, get_db
from security import get_current_user
from maintenance_calculator import MaintenanceCalculator, get_intervention_key

router = APIRouter(tags=["dashboard"])
calculator = MaintenanceCalculator()


# No complex estimation — just use purchase_price


@router.get("/dashboard")
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated dashboard data for the current user."""
    vehicles = db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()

    total_vehicles = len(vehicles)
    total_mileage = sum(v.current_mileage for v in vehicles)

    # Maintenance stats
    all_maintenances = db.query(Maintenance).filter(
        Maintenance.vehicle_id.in_([v.id for v in vehicles])
    ).all() if vehicles else []

    total_maintenance_cost = sum(m.cost_paid or 0 for m in all_maintenances)
    total_maintenances = len(all_maintenances)

    # Fuel stats
    all_fuel = db.query(FuelLog).filter(
        FuelLog.vehicle_id.in_([v.id for v in vehicles])
    ).all() if vehicles else []

    total_fuel_cost = sum(f.total_cost or 0 for f in all_fuel)
    total_liters = sum(f.liters or 0 for f in all_fuel)

    # Per-vehicle summary with upcoming maintenance status
    overdue_total = 0
    urgent_total = 0
    warning_total = 0

    alert_details = []  # per-vehicle alert breakdown
    vehicle_summaries = []
    for v in vehicles:
        # Get upcoming maintenances
        v_maintenances = [m for m in all_maintenances if m.vehicle_id == v.id]
        last_maintenances = {}
        for m in v_maintenances:
            key = get_intervention_key(m.intervention_type)
            current_last = last_maintenances.get(key)
            if current_last is None or m.execution_date > current_last[0]:
                last_maintenances[key] = (m.execution_date, m.mileage_at_intervention)

        upcoming = calculator.get_all_upcoming_maintenances(
            v.vehicle_type, v.current_mileage, last_maintenances,
            v.displacement, v.year, v.registration_date,
            brand=v.brand,
            service_interval_km=v.service_interval_km,
            service_interval_months=v.service_interval_months,
            motorization=v.motorization,
        )

        overdue = sum(1 for u in upcoming if u["status"] == "overdue")
        urgent = sum(1 for u in upcoming if u["status"] == "urgent")
        warn = sum(1 for u in upcoming if u["status"] == "warning")
        overdue_total += overdue
        urgent_total += urgent
        warning_total += warn

        # Per-vehicle alert details
        if overdue > 0:
            alert_details.append({"vehicle_name": v.name, "vehicle_id": v.id, "type": "overdue", "count": overdue})
        if urgent > 0:
            alert_details.append({"vehicle_name": v.name, "vehicle_id": v.id, "type": "urgent", "count": urgent})
        if warn > 0:
            alert_details.append({"vehicle_name": v.name, "vehicle_id": v.id, "type": "warning", "count": warn})

        # Vehicle cost
        v_maint_cost = sum(m.cost_paid or 0 for m in v_maintenances)
        v_fuel_logs = [f for f in all_fuel if f.vehicle_id == v.id]
        v_fuel_cost = sum(f.total_cost or 0 for f in v_fuel_logs)

        # Health score
        if overdue > 0:
            health = max(0, 20 - overdue * 10)
        elif urgent > 0:
            health = max(20, 50 - urgent * 10)
        elif warn > 0:
            health = max(50, 80 - warn * 5)
        else:
            health = 100

        vehicle_summaries.append({
            "id": v.id,
            "name": v.name,
            "brand": v.brand,
            "model": v.model,
            "year": v.year,
            "vehicle_type": v.vehicle_type,
            "current_mileage": v.current_mileage,
            "photo_url": f"/api/vehicles/{v.id}/photo" if v.photo_path else None,
            "health_score": health,
            "overdue_count": overdue,
            "urgent_count": urgent,
            "warning_count": warn,
            "total_cost": round(v_maint_cost + v_fuel_cost, 2),
            "maintenance_cost": round(v_maint_cost, 2),
            "fuel_cost": round(v_fuel_cost, 2),
            "purchase_price": v.purchase_price,
            "next_maintenance": upcoming[0]["intervention_type"] if upcoming else None,
            "next_maintenance_status": upcoming[0]["status"] if upcoming else "ok",
        })

    # Recent activity (last 10 maintenances)
    recent = sorted(all_maintenances, key=lambda m: m.execution_date, reverse=True)[:10]
    recent_activity = []
    for m in recent:
        v = next((v for v in vehicles if v.id == m.vehicle_id), None)
        recent_activity.append({
            "id": m.id,
            "vehicle_name": v.name if v else "?",
            "vehicle_id": m.vehicle_id,
            "intervention_type": m.other_description if m.intervention_type == "Autre" and m.other_description else m.intervention_type,
            "execution_date": m.execution_date.isoformat(),
            "cost_paid": m.cost_paid,
        })

    # Monthly cost breakdown (last 12 months)
    now = datetime.now(timezone.utc)
    monthly_costs = {}
    for m in all_maintenances:
        key = m.execution_date.strftime("%Y-%m")
        monthly_costs[key] = monthly_costs.get(key, 0) + (m.cost_paid or 0)
    for f in all_fuel:
        key = f.fill_date.strftime("%Y-%m")
        monthly_costs[key] = monthly_costs.get(key, 0) + (f.total_cost or 0)

    # Sort and take last 12
    sorted_months = sorted(monthly_costs.items())[-12:]

    # Total fleet purchase price
    fleet_purchase_price = sum(vs["purchase_price"] or 0 for vs in vehicle_summaries)

    return {
        "total_vehicles": total_vehicles,
        "total_mileage": total_mileage,
        "total_cost": round(total_maintenance_cost + total_fuel_cost, 2),
        "total_maintenance_cost": round(total_maintenance_cost, 2),
        "total_fuel_cost": round(total_fuel_cost, 2),
        "total_maintenances": total_maintenances,
        "total_liters": round(total_liters, 1),
        "overdue_count": overdue_total,
        "urgent_count": urgent_total,
        "warning_count": warning_total,
        "fleet_purchase_price": fleet_purchase_price,
        "alert_details": alert_details,
        "vehicles": vehicle_summaries,
        "recent_activity": recent_activity,
        "monthly_costs": [{"month": k, "cost": round(v, 2)} for k, v in sorted_months],
    }
