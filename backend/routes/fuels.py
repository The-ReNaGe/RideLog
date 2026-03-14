import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models import Vehicle, FuelLog, User, get_db
from schemas import FuelLogCreate, FuelLogUpdate
from security import get_current_user

logger = logging.getLogger("ridelog.fuels")
router = APIRouter(prefix="/vehicles", tags=["fuels"])


def _compute_stats(logs):
    # Monthly breakdown: include ALL logs
    monthly_map = {}
    for log in logs:
        month_key = log.fill_date.strftime("%Y-%m")
        if month_key not in monthly_map:
            monthly_map[month_key] = {"month": month_key, "total_cost": 0.0, "total_liters": 0.0, "entries": 0}
        monthly_map[month_key]["total_cost"] += float(log.total_cost or 0)
        monthly_map[month_key]["total_liters"] += float(log.liters or 0)
        monthly_map[month_key]["entries"] += 1

    monthly_breakdown = []
    for month in sorted(monthly_map.keys(), reverse=True):
        item = monthly_map[month]
        liters = item["total_liters"]
        cost = item["total_cost"]
        item["avg_price_per_liter"] = round((cost / liters), 3) if liters > 0 else None
        item["total_cost"] = round(cost, 2)
        item["total_liters"] = round(liters, 2)
        monthly_breakdown.append(item)

    total_all_cost = sum(float(l.total_cost or 0) for l in logs)
    total_all_liters = sum(float(l.liters or 0) for l in logs if l.liters and l.liters > 0)

    # ── Cost-based segments: computed from ALL logs sorted by mileage ──
    # Between two consecutive fill-ups we know distance and cost → cost/100km
    all_sorted = sorted(logs, key=lambda x: (x.mileage_at_fill, x.fill_date))
    cost_segments = []
    chart_points = []

    for index in range(1, len(all_sorted)):
        prev = all_sorted[index - 1]
        curr = all_sorted[index]
        distance = curr.mileage_at_fill - prev.mileage_at_fill
        if distance <= 0:
            continue

        cost = float(curr.total_cost or 0)
        cost_100 = (cost / distance) * 100

        liters = float(curr.liters or 0) if curr.liters and curr.liters > 0 else None
        consumption = (liters / distance) * 100 if liters else None
        price_per_l = cost / liters if liters else None

        cost_segments.append({
            "distance": distance,
            "cost": cost,
            "liters": liters,
            "cost_100km": round(cost_100, 2),
            "consumption_l_100": round(consumption, 2) if consumption else None,
        })
        chart_points.append({
            "date": curr.fill_date.date().isoformat(),
            "mileage": curr.mileage_at_fill,
            "consumption_l_100": round(consumption, 2) if consumption else None,
            "cost_100km": round(cost_100, 2),
            "price_per_liter": round(price_per_l, 3) if price_per_l else None,
            "total_cost": round(cost, 2),
            "distance": distance,
        })

    total_distance = sum(s["distance"] for s in cost_segments)
    total_seg_cost = sum(s["cost"] for s in cost_segments)
    segs_with_liters = [s for s in cost_segments if s["liters"]]
    total_seg_liters = sum(s["liters"] for s in segs_with_liters)
    total_liters_distance = sum(s["distance"] for s in segs_with_liters)

    avg_cost_100 = (total_seg_cost / total_distance) * 100 if total_distance > 0 else None
    avg_consumption = (total_seg_liters / total_liters_distance) * 100 if total_liters_distance > 0 else None
    avg_price_l = (total_all_cost / total_all_liters) if total_all_liters > 0 else None

    # Average distance per tank
    distances = [s["distance"] for s in cost_segments]
    avg_distance_per_tank = round(sum(distances) / len(distances)) if distances else None

    # ── Station stats ──
    station_map = {}
    for log in logs:
        station_name = (log.station or "").strip()
        if not station_name:
            continue
        if station_name not in station_map:
            station_map[station_name] = {"station": station_name, "visits": 0, "total_cost": 0.0, "total_liters": 0.0}
        station_map[station_name]["visits"] += 1
        station_map[station_name]["total_cost"] += float(log.total_cost or 0)
        station_map[station_name]["total_liters"] += float(log.liters or 0)
    station_stats = []
    for s in sorted(station_map.values(), key=lambda x: x["visits"], reverse=True):
        avg_ppl = round(s["total_cost"] / s["total_liters"], 3) if s["total_liters"] > 0 else None
        station_stats.append({
            "station": s["station"],
            "visits": s["visits"],
            "total_cost": round(s["total_cost"], 2),
            "total_liters": round(s["total_liters"], 2),
            "avg_price_per_liter": avg_ppl,
        })

    # ── Monthly average and projection ──
    # Only count months that are fully past (exclude current month)
    from datetime import date as date_type
    today = date_type.today()
    current_month_key = today.strftime("%Y-%m")
    past_months = [m for m in monthly_map.keys() if m < current_month_key]
    past_months_costs = [monthly_map[m]["total_cost"] for m in past_months]
    monthly_avg_cost = round(sum(past_months_costs) / len(past_months_costs), 2) if past_months_costs else None

    # Current month actual spending
    current_month_cost = round(monthly_map.get(current_month_key, {}).get("total_cost", 0), 2) or None

    return {
        "entries": len(logs),
        "distance_tracked": total_distance,
        "total_fuel_liters": round(total_all_liters, 2),
        "total_fuel_cost": round(total_all_cost, 2),
        "avg_price_per_liter": round(avg_price_l, 3) if avg_price_l is not None else None,
        "avg_consumption_l_100": round(avg_consumption, 2) if avg_consumption is not None else None,
        "avg_cost_100km": round(avg_cost_100, 2) if avg_cost_100 is not None else None,
        "avg_distance_per_tank": avg_distance_per_tank,
        "monthly_avg_cost": monthly_avg_cost,
        "current_month_cost": current_month_cost,
        "chart_points": chart_points[-24:],
        "monthly_breakdown": monthly_breakdown,
        "station_stats": station_stats,
    }


@router.get("/{vehicle_id}/fuel-logs")
def get_fuel_logs(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    logs = db.query(FuelLog).filter(FuelLog.vehicle_id == vehicle_id).order_by(FuelLog.fill_date.desc()).all()
    return [log.to_dict() for log in logs]


@router.post("/{vehicle_id}/fuel-logs", status_code=201)
def create_fuel_log(
    vehicle_id: int,
    data: FuelLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    fill_date = data.fill_date
    if isinstance(fill_date, str):
        fill_date = datetime.fromisoformat(fill_date.replace("Z", "+00:00"))

    total_cost = float(data.total_cost or 0)
    if total_cost <= 0:
        raise HTTPException(status_code=400, detail="Le coût total doit être > 0")

    mileage_at_fill = int(data.mileage_at_fill or 0)
    if mileage_at_fill <= 0:
        raise HTTPException(status_code=400, detail="Kilométrage invalide")

    price_per_liter = float(data.price_per_liter)
    if price_per_liter <= 0:
        raise HTTPException(status_code=400, detail="Le prix au litre doit être > 0")
    liters = total_cost / price_per_liter

    fuel_log = FuelLog(
        vehicle_id=vehicle_id,
        fill_date=fill_date,
        mileage_at_fill=mileage_at_fill,
        liters=liters,
        total_cost=total_cost,
        price_per_liter=price_per_liter,
        station=data.station,
        notes=data.notes,
    )

    db.add(fuel_log)
    if mileage_at_fill > vehicle.current_mileage:
        vehicle.current_mileage = mileage_at_fill
    vehicle.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(fuel_log)
    return fuel_log.to_dict()


@router.put("/{vehicle_id}/fuel-logs/{fuel_log_id}")
def update_fuel_log(
    vehicle_id: int,
    fuel_log_id: int,
    data: FuelLogUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    fuel_log = db.query(FuelLog).filter(
        FuelLog.id == fuel_log_id,
        FuelLog.vehicle_id == vehicle_id,
    ).first()
    if not fuel_log:
        raise HTTPException(status_code=404, detail="Fuel log not found")

    update_data = data.model_dump(exclude_unset=True)

    if "fill_date" in update_data:
        fd = update_data["fill_date"]
        if isinstance(fd, str):
            fd = datetime.fromisoformat(fd.replace("Z", "+00:00"))
        fuel_log.fill_date = fd

    if "mileage_at_fill" in update_data:
        fuel_log.mileage_at_fill = update_data["mileage_at_fill"]

    if "total_cost" in update_data:
        fuel_log.total_cost = update_data["total_cost"]

    if "price_per_liter" in update_data:
        fuel_log.price_per_liter = update_data["price_per_liter"]

    if "station" in update_data:
        fuel_log.station = update_data["station"]

    if "notes" in update_data:
        fuel_log.notes = update_data["notes"]

    # Recalculate liters from cost and price_per_liter
    ppl = float(fuel_log.price_per_liter or 0)
    tc = float(fuel_log.total_cost or 0)
    if ppl > 0 and tc > 0:
        fuel_log.liters = tc / ppl

    if fuel_log.mileage_at_fill > vehicle.current_mileage:
        vehicle.current_mileage = fuel_log.mileage_at_fill
    vehicle.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(fuel_log)
    return fuel_log.to_dict()


@router.delete("/{vehicle_id}/fuel-logs/{fuel_log_id}")
def delete_fuel_log(
    vehicle_id: int,
    fuel_log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    fuel_log = db.query(FuelLog).filter(
        FuelLog.id == fuel_log_id,
        FuelLog.vehicle_id == vehicle_id,
    ).first()
    if not fuel_log:
        raise HTTPException(status_code=404, detail="Fuel log not found")

    db.delete(fuel_log)
    db.commit()
    return {"status": "deleted", "fuel_log_id": fuel_log_id}


@router.get("/{vehicle_id}/fuel-stats")
def get_fuel_stats(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    logs = db.query(FuelLog).filter(FuelLog.vehicle_id == vehicle_id).order_by(FuelLog.fill_date.asc()).all()
    stats = _compute_stats(logs)
    return {
        "vehicle_id": vehicle_id,
        "stats": stats,
    }
