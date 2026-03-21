import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from maintenance_calculator import MaintenanceCalculator, get_intervention_key
from models import User, Vehicle, Maintenance, MaintenanceInvoice, VehicleMaintenanceOverride, get_db
from schemas import IntervalOverrideUpdate
from security import get_current_user
from routes import secure_delete
from reminder_scheduler import clear_notification_logs_for, _check_vehicle_reminders

logger = logging.getLogger("ridelog.maintenances")
router = APIRouter(prefix="/vehicles", tags=["maintenances"])
calculator = MaintenanceCalculator()
INVOICE_STORAGE_DIR = Path(os.getenv("INVOICE_STORAGE_DIR", "/data/invoices"))
ALLOWED_INVOICE_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_INVOICE_SIZE_BYTES = 10 * 1024 * 1024


def _load_overrides(vehicle_id: int, db: Session) -> dict:
    rows = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id == vehicle_id
    ).all()
    return {row.intervention_key: row for row in rows}


def _apply_overrides(intervals: dict, overrides: dict) -> dict:
    result = {}
    for key, info in intervals.items():
        if not isinstance(info, dict):
            result[key] = info
            continue
        override = overrides.get(key)
        if override is None:
            result[key] = info
            continue
        entry = dict(info)
        if override.is_km_disabled:
            entry["km_interval"] = None
        elif override.km_interval is not None:
            entry["km_interval"] = override.km_interval
        if override.is_months_disabled:
            entry["months_interval"] = None
        elif override.months_interval is not None:
            entry["months_interval"] = override.months_interval
        entry["has_override"] = True
        result[key] = entry
    return result


def _estimate_mileage(vehicle_id: int, target_date: datetime, vehicle: Vehicle, db: Session) -> Optional[int]:
    """Estime le kilométrage à une date par interpolation/extrapolation linéaire."""
    maintenances = db.query(Maintenance).filter(
        Maintenance.vehicle_id == vehicle_id,
        Maintenance.mileage_at_intervention.isnot(None),
        Maintenance.mileage_at_intervention > 0,
    ).order_by(Maintenance.execution_date).all()

    fuel_logs = []
    try:
        from models import FuelLog
        fuel_logs = db.query(FuelLog).filter(
            FuelLog.vehicle_id == vehicle_id,
            FuelLog.mileage_at_fill.isnot(None),
            FuelLog.mileage_at_fill > 0,
        ).order_by(FuelLog.fill_date).all()
    except Exception:
        pass

    points = []
    for m in maintenances:
        d = m.execution_date
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        points.append((d, m.mileage_at_intervention))
    for f in fuel_logs:
        d = f.fill_date
        if hasattr(d, 'tzinfo') and d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        points.append((d, f.mileage_at_fill))

    if vehicle.current_mileage > 0:
        points.append((datetime.now(timezone.utc), vehicle.current_mileage))

    points.sort(key=lambda x: x[0])

    if not points:
        return None

    if target_date.tzinfo is None:
        target_date = target_date.replace(tzinfo=timezone.utc)

    before = [(d, km) for d, km in points if d <= target_date]
    after  = [(d, km) for d, km in points if d > target_date]

    if before and after:
        d0, km0 = before[-1]
        d1, km1 = after[0]
        total_seconds = (d1 - d0).total_seconds()
        if total_seconds <= 0:
            return km0
        ratio = (target_date - d0).total_seconds() / total_seconds
        return max(0, int(round(km0 + ratio * (km1 - km0))))

    elif before:
        if len(before) >= 2:
            d0, km0 = before[-2]
            d1, km1 = before[-1]
            elapsed = (d1 - d0).total_seconds()
            if elapsed > 0:
                km_per_sec = (km1 - km0) / elapsed
                extra = (target_date - d1).total_seconds() * km_per_sec
                return max(0, int(round(km1 + extra)))
        return before[-1][1]

    elif after:
        if len(after) >= 2:
            d0, km0 = after[0]
            d1, km1 = after[1]
            elapsed = (d1 - d0).total_seconds()
            if elapsed > 0:
                km_per_sec = (km1 - km0) / elapsed
                extra = (d0 - target_date).total_seconds() * km_per_sec
                return max(0, int(round(km0 - extra)))
        return after[0][1]

    return None


@router.get("/{vehicle_id}/available-interventions")
def get_available_interventions(
    vehicle_id: int, vehicle_type: str, displacement: int = None,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    intervals = calculator.get_intervals_for_vehicle(
        vehicle_type, displacement, brand=vehicle.brand,
        service_interval_km=vehicle.service_interval_km,
        service_interval_months=vehicle.service_interval_months,
    )
    range_cat = vehicle.range_category or 'generalist'
    result = []
    for intervention_key, interval_info in intervals.items():
        if not isinstance(interval_info, dict) or "name" not in interval_info:
            continue
        prices = interval_info.get("prices", {})
        price_data = prices.get(range_cat, {})
        result.append({
            "id": intervention_key,
            "name": interval_info.get("name"),
            "km_interval": interval_info.get("km_interval"),
            "months_interval": interval_info.get("months_interval"),
            "condition_based": interval_info.get("condition_based", False),
            "prices": interval_info.get("prices", {}),
            "price_range": {"min": price_data.get("min"), "max": price_data.get("max")},
        })
    return {"interventions": result}


@router.get("/{vehicle_id}/maintenances")
def get_maintenances(
    vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    maintenances = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle_id).order_by(
        Maintenance.execution_date.desc()
    ).all()
    payload = []
    for maintenance in maintenances:
        item = maintenance.to_dict()
        for invoice in item.get("invoices", []):
            invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
        payload.append(item)
    return payload


@router.post("/{vehicle_id}/maintenances")
async def create_maintenance(
    vehicle_id: int, request: Request,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Enregistre une intervention. Le kilométrage est optionnel — estimé par interpolation si absent."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    content_type = request.headers.get("content-type", "")
    data = {}
    invoice_files = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw_mileage = form.get("mileage_at_intervention")
        data = {
            "intervention_type": form.get("intervention_type"),
            "execution_date": form.get("execution_date"),
            "mileage_at_intervention": int(raw_mileage) if raw_mileage and str(raw_mileage).strip() else None,
            "cost_paid": float(form.get("cost_paid")) if form.get("cost_paid") else None,
            "notes": form.get("notes"),
            "maintenance_category": form.get("maintenance_category", "scheduled"),
            "other_description": form.get("other_description"),
        }
        invoice_files = form.getlist("invoice_files") if "invoice_files" in form else []
    else:
        data = await request.json()
        if not data.get("mileage_at_intervention"):
            data["mileage_at_intervention"] = None

    execution_date = data.get("execution_date")
    if isinstance(execution_date, str):
        execution_date = datetime.fromisoformat(execution_date.replace("Z", "+00:00"))

    # Kilométrage optionnel — estimation si absent
    mileage = data.get("mileage_at_intervention")
    mileage_estimated = False
    if not mileage:
        mileage = _estimate_mileage(vehicle_id, execution_date, vehicle, db)
        mileage_estimated = mileage is not None
        if mileage:
            logger.info("Kilométrage estimé à %d km pour véhicule %d à %s", mileage, vehicle_id, execution_date)

    if mileage and mileage > vehicle.current_mileage:
        vehicle.current_mileage = mileage

    maintenance = Maintenance(
        vehicle_id=vehicle_id,
        intervention_type=data.get("intervention_type"),
        execution_date=execution_date,
        mileage_at_intervention=mileage,
        cost_paid=data.get("cost_paid"),
        notes=data.get("notes"),
        maintenance_category=data.get("maintenance_category", "scheduled"),
        other_description=data.get("other_description"),
    )
    db.add(maintenance)
    db.flush()

    for invoice_file in invoice_files[:10]:
        if not hasattr(invoice_file, "filename") or not invoice_file.filename:
            continue
        invoice_content = await invoice_file.read()
        if len(invoice_content) > MAX_INVOICE_SIZE_BYTES:
            db.rollback()
            raise HTTPException(status_code=400, detail="Un fichier de facture dépasse 10 Mo")
        invoice_mime_type = (getattr(invoice_file, "content_type", None) or "application/octet-stream").lower()
        if invoice_mime_type not in ALLOWED_INVOICE_MIME_TYPES:
            db.rollback()
            raise HTTPException(status_code=400, detail="Type de fichier non supporté (PDF, JPG, PNG, WEBP uniquement)")
        INVOICE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = Path(invoice_file.filename).name
        stored_name = f"{vehicle_id}_{maintenance.id}_{uuid.uuid4().hex}{Path(safe_name).suffix or '.bin'}"
        stored_path = INVOICE_STORAGE_DIR / stored_name
        with open(stored_path, "wb") as f:
            f.write(invoice_content)
        db.add(MaintenanceInvoice(
            maintenance_id=maintenance.id, filename=safe_name,
            file_path=str(stored_path), mime_type=invoice_mime_type, file_size=len(invoice_content),
        ))

    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(maintenance)
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)
    try:
        await _check_vehicle_reminders(vehicle, db)
    except Exception:
        logger.warning("Failed to trigger immediate reminder check for vehicle %s", vehicle_id)

    payload = maintenance.to_dict()
    for invoice in payload.get("invoices", []):
        invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
    if mileage_estimated and mileage:
        payload["mileage_estimated"] = True
        payload["estimated_mileage"] = mileage
    return payload


@router.put("/{vehicle_id}/maintenances/{maintenance_id}")
async def update_maintenance(
    vehicle_id: int, maintenance_id: int, request: Request,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    maintenance = db.query(Maintenance).filter(Maintenance.id == maintenance_id, Maintenance.vehicle_id == vehicle_id).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        data = {
            "execution_date": form.get("execution_date"),
            "mileage_at_intervention": form.get("mileage_at_intervention"),
            "cost_paid": form.get("cost_paid"),
            "notes": form.get("notes"),
        }
        invoice_files = form.getlist("invoice_files")
    else:
        data = await request.json()
        invoice_files = None

    if "execution_date" in data and data["execution_date"]:
        execution_date = data["execution_date"]
        if isinstance(execution_date, str):
            execution_date = datetime.fromisoformat(execution_date.replace("Z", "+00:00"))
        maintenance.execution_date = execution_date

    if "mileage_at_intervention" in data:
        raw = data["mileage_at_intervention"]
        mileage = int(raw) if raw and str(raw).strip() else None
        if mileage and mileage > 0:
            maintenance.mileage_at_intervention = mileage
            if mileage > vehicle.current_mileage:
                vehicle.current_mileage = mileage

    if "cost_paid" in data:
        cost = data.get("cost_paid")
        maintenance.cost_paid = float(cost) if cost else None

    if "notes" in data:
        maintenance.notes = data.get("notes")

    if invoice_files:
        for file in invoice_files:
            if file.filename and file.filename.strip():
                try:
                    file_data = await file.read()
                    if len(file_data) > MAX_INVOICE_SIZE_BYTES:
                        raise HTTPException(status_code=400, detail="Un fichier de facture dépasse 10 Mo")
                    invoice_mime = (getattr(file, "content_type", None) or "application/octet-stream").lower()
                    if invoice_mime not in ALLOWED_INVOICE_MIME_TYPES:
                        raise HTTPException(status_code=400, detail="Type de fichier non supporté")
                    safe_name = Path(file.filename).name
                    stored_name = f"{vehicle_id}_{maintenance_id}_{uuid.uuid4().hex}{Path(safe_name).suffix or '.bin'}"
                    INVOICE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
                    stored_path = INVOICE_STORAGE_DIR / stored_name
                    stored_path.write_bytes(file_data)
                    db.add(MaintenanceInvoice(
                        maintenance_id=maintenance.id, filename=safe_name,
                        file_path=str(stored_path), mime_type=invoice_mime, file_size=len(file_data),
                    ))
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Failed to save invoice file: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to save file: {safe_name}")

    vehicle.updated_at = datetime.now(timezone.utc)
    maintenance.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(maintenance)
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)
    try:
        await _check_vehicle_reminders(vehicle, db)
    except Exception:
        logger.warning("Failed to trigger immediate reminder check for vehicle %s", vehicle_id)

    payload = maintenance.to_dict()
    for invoice in payload.get("invoices", []):
        invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
    return payload


@router.delete("/{vehicle_id}/maintenances/{maintenance_id}")
def delete_maintenance(
    vehicle_id: int, maintenance_id: int,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    maintenance = db.query(Maintenance).filter(Maintenance.id == maintenance_id, Maintenance.vehicle_id == vehicle_id).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")
    for invoice in maintenance.invoices:
        if invoice.file_path:
            secure_delete(invoice.file_path)
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)
    db.delete(maintenance)
    db.commit()
    return {"detail": "Maintenance deleted"}


@router.get("/{vehicle_id}/maintenances/{maintenance_id}/invoices/{invoice_id}")
def download_maintenance_invoice(
    vehicle_id: int, maintenance_id: int, invoice_id: int,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    maintenance = db.query(Maintenance).filter(Maintenance.id == maintenance_id, Maintenance.vehicle_id == vehicle_id).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")
    invoice = db.query(MaintenanceInvoice).filter(MaintenanceInvoice.id == invoice_id, MaintenanceInvoice.maintenance_id == maintenance_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice_file = Path(invoice.file_path)
    if not invoice_file.exists():
        raise HTTPException(status_code=404, detail="Invoice file not found on disk")
    return FileResponse(path=str(invoice_file), media_type=invoice.mime_type or "application/octet-stream", filename=invoice.filename or invoice_file.name)


@router.get("/{vehicle_id}/interval-overrides")
def get_interval_overrides(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    overrides = db.query(VehicleMaintenanceOverride).filter(VehicleMaintenanceOverride.vehicle_id == vehicle_id).all()
    return [o.to_dict() for o in overrides]


@router.put("/{vehicle_id}/interval-overrides/{intervention_key}")
def upsert_interval_override(
    vehicle_id: int, intervention_key: str, body: IntervalOverrideUpdate,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    override = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id == vehicle_id,
        VehicleMaintenanceOverride.intervention_key == intervention_key,
    ).first()
    if override is None:
        override = VehicleMaintenanceOverride(vehicle_id=vehicle_id, intervention_key=intervention_key)
        db.add(override)
    override.km_interval = body.km_interval
    override.months_interval = body.months_interval
    override.is_km_disabled = body.is_km_disabled
    override.is_months_disabled = body.is_months_disabled
    override.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(override)
    return override.to_dict()


@router.delete("/{vehicle_id}/interval-overrides/{intervention_key}")
def delete_interval_override(
    vehicle_id: int, intervention_key: str,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    override = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id == vehicle_id,
        VehicleMaintenanceOverride.intervention_key == intervention_key,
    ).first()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    db.delete(override)
    db.commit()
    return {"detail": "Override deleted, reverted to default interval"}


def _compute_upcoming(vehicle: Vehicle, db: Session) -> dict:
    last_maintenances = {}
    all_maintenances = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle.id).all()
    for maintenance in all_maintenances:
        key = get_intervention_key(maintenance.intervention_type)
        current_last = last_maintenances.get(key)
        if current_last is None or maintenance.execution_date > current_last[0]:
            last_maintenances[key] = (maintenance.execution_date, maintenance.mileage_at_intervention)

    overrides = _load_overrides(vehicle.id, db)
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle.vehicle_type, vehicle.current_mileage, last_maintenances,
        vehicle.displacement, vehicle.year, vehicle.registration_date,
        brand=vehicle.brand, service_interval_km=vehicle.service_interval_km,
        service_interval_months=vehicle.service_interval_months,
        motorization=vehicle.motorization, overrides=overrides,
    )
    maintenance_category = calculator.get_maintenance_category(vehicle.vehicle_type, vehicle.brand, vehicle.year)
    for item in upcoming:
        cost_est = calculator.get_estimated_cost(
            vehicle.vehicle_type, item["intervention_type"], vehicle.displacement, maintenance_category,
            brand=vehicle.brand, service_interval_km=vehicle.service_interval_km,
            service_interval_months=vehicle.service_interval_months,
        )
        item["estimated_cost_min"] = cost_est.get("min") if cost_est else None
        item["estimated_cost_max"] = cost_est.get("max") if cost_est else None
    return {"vehicle_id": vehicle.id, "upcoming": upcoming}


@router.get("/{vehicle_id}/upcoming")
def get_upcoming_maintenances(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return _compute_upcoming(vehicle, db)


@router.get("/{vehicle_id}/recommendations")
def get_recommendations(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    recommendations = []
    vehicle_age = datetime.now(timezone.utc).year - vehicle.year
    if vehicle_age > 10:
        timings = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle_id, Maintenance.intervention_type.ilike("%timing%")).all()
        if not timings:
            recommendations.append({"type": "warning", "message": f"Ce véhicule a {vehicle_age} ans. Aucun remplacement de courroie de distribution enregistré. C'est une intervention critique. Vérifiez l'historique d'entretien."})

    upcoming = _compute_upcoming(vehicle, db)["upcoming"]
    urgent_count = sum(1 for u in upcoming if u["status"] == "urgent")
    if urgent_count >= 2:
        costs = sum(u.get("estimated_cost_max", 0) or 0 for u in upcoming if u["status"] == "urgent")
        recommendations.append({"type": "warning", "message": f"Plusieurs entretiens urgents détectés ({urgent_count} interventions). Envisagez de les regrouper pour réduire les coûts de main-d'œuvre. Total estimé : {costs:.0f} €."})

    overdue_count = sum(1 for u in upcoming if u["status"] == "overdue")
    if overdue_count > 0:
        recommendations.append({"type": "error", "message": f"{overdue_count} entretien(s) en retard. Veuillez les effectuer dès que possible."})

    return {"vehicle_id": vehicle_id, "recommendations": recommendations}


@router.get("/{vehicle_id}/cost-forecast")
def get_cost_forecast(vehicle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    upcoming = _compute_upcoming(vehicle, db)["upcoming"]
    return {
        "vehicle_id": vehicle_id,
        "total_cost_min": sum(u.get("estimated_cost_min", 0) or 0 for u in upcoming),
        "total_cost_max": sum(u.get("estimated_cost_max", 0) or 0 for u in upcoming),
        "upcoming_count": len(upcoming),
        "urgent_count": sum(1 for u in upcoming if u["status"] in ["overdue", "urgent"]),
    }