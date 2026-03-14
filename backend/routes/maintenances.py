import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from maintenance_calculator import MaintenanceCalculator, get_intervention_key
from models import User, Vehicle, Maintenance, MaintenanceInvoice, get_db
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


@router.get("/{vehicle_id}/available-interventions")
def get_available_interventions(
    vehicle_id: int,
    vehicle_type: str,
    displacement: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get available maintenance interventions for a vehicle with prices."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Get intervals from calculator
    intervals = calculator.get_intervals_for_vehicle(
        vehicle_type, displacement,
        brand=vehicle.brand,
        service_interval_km=vehicle.service_interval_km,
        service_interval_months=vehicle.service_interval_months,
    )
    range_cat = vehicle.range_category or 'generalist'
    
    result = []
    for intervention_key, interval_info in intervals.items():
        # Skip non-intervention entries like "description"
        if not isinstance(interval_info, dict) or "name" not in interval_info:
            continue
        
        # Get prices for the specific category
        prices = interval_info.get("prices", {})
        price_data = prices.get(range_cat, {})
        
        result.append({
            "id": intervention_key,
            "name": interval_info.get("name"),
            "km_interval": interval_info.get("km_interval"),
            "months_interval": interval_info.get("months_interval"),
            "condition_based": interval_info.get("condition_based", False),
            "prices": interval_info.get("prices", {}),
            "price_range": {
                "min": price_data.get("min"),
                "max": price_data.get("max"),
            }
        })
    
    return {"interventions": result}


@router.get("/{vehicle_id}/maintenances")
def get_maintenances(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get maintenance history for a vehicle."""
    if current_user.is_integration_account:
        # Compte intégration voit toutes les maintenances de tous les véhicules
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        # User normal voit ses maintenances uniquement
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id,
            Vehicle.user_id == current_user.id  # Vérification de propriété
        ).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    maintenances = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle_id).order_by(
        Maintenance.execution_date.desc()
    ).all()

    payload = []
    for maintenance in maintenances:
        item = maintenance.to_dict()
        # Add invoice download URLs
        for invoice in item.get("invoices", []):
            invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
        payload.append(item)

    return payload


@router.post("/{vehicle_id}/maintenances")
async def create_maintenance(
    vehicle_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a maintenance intervention with up to 10 invoices."""
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id,
        Vehicle.user_id == current_user.id  # Vérification de propriété
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    content_type = request.headers.get("content-type", "")
    data = {}
    invoice_files = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        data = {
            "intervention_type": form.get("intervention_type"),
            "execution_date": form.get("execution_date"),
            "mileage_at_intervention": int(form.get("mileage_at_intervention") or 0),
            "cost_paid": float(form.get("cost_paid")) if form.get("cost_paid") else None,
            "notes": form.get("notes"),
            "maintenance_category": form.get("maintenance_category", "scheduled"),
            "other_description": form.get("other_description"),
        }
        # Get all invoice files (supports multiple)
        invoice_files = form.getlist("invoice_files") if "invoice_files" in form else []
    else:
        data = await request.json()

    # Update vehicle mileage if the intervention mileage is higher
    if data.get("mileage_at_intervention", 0) > vehicle.current_mileage:
        vehicle.current_mileage = data.get("mileage_at_intervention", 0)

    execution_date = data.get("execution_date")
    if isinstance(execution_date, str):
        execution_date = datetime.fromisoformat(execution_date.replace("Z", "+00:00"))

    # Create maintenance record
    maintenance = Maintenance(
        vehicle_id=vehicle_id,
        intervention_type=data.get("intervention_type"),
        execution_date=execution_date,
        mileage_at_intervention=data.get("mileage_at_intervention"),
        cost_paid=data.get("cost_paid"),
        notes=data.get("notes"),
        maintenance_category=data.get("maintenance_category", "scheduled"),
        other_description=data.get("other_description"),
    )

    db.add(maintenance)
    db.flush()  # Get the maintenance ID without committing yet

    # Process invoices (max 10)
    processed_count = 0
    for invoice_file in invoice_files[:10]:  # Limit to 10 files
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
        extension = Path(safe_name).suffix or ".bin"
        stored_name = f"{vehicle_id}_{maintenance.id}_{uuid.uuid4().hex}{extension}"
        stored_path = INVOICE_STORAGE_DIR / stored_name
        
        with open(stored_path, "wb") as f:
            f.write(invoice_content)

        # Create MaintenanceInvoice record
        invoice_record = MaintenanceInvoice(
            maintenance_id=maintenance.id,
            filename=safe_name,
            file_path=str(stored_path),
            mime_type=invoice_mime_type,
            file_size=len(invoice_content),
        )
        db.add(invoice_record)
        processed_count += 1

    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(maintenance)

    # Clear notification logs so reminders restart for the next cycle
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)

    # Immediately check and send notifications for this vehicle
    try:
        await _check_vehicle_reminders(vehicle, db)
    except Exception:
        logger.warning("Failed to trigger immediate reminder check for vehicle %s", vehicle_id)

    payload = maintenance.to_dict()
    # Add invoice download URLs
    for invoice in payload.get("invoices", []):
        invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
    
    return payload


@router.put("/{vehicle_id}/maintenances/{maintenance_id}")
async def update_maintenance(
    vehicle_id: int,
    maintenance_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a maintenance record (execution_date, mileage, cost, notes) and optionally add invoices."""
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id,
        Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    maintenance = db.query(Maintenance).filter(
        Maintenance.id == maintenance_id,
        Maintenance.vehicle_id == vehicle_id,
    ).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")

    # Check if request is FormData (has files) or JSON
    content_type = request.headers.get("content-type", "")
    
    if "multipart/form-data" in content_type:
        # Handle FormData (with files)
        form = await request.form()
        data = {
            "execution_date": form.get("execution_date"),
            "mileage_at_intervention": form.get("mileage_at_intervention"),
            "cost_paid": form.get("cost_paid"),
            "notes": form.get("notes"),
        }
        invoice_files = form.getlist("invoice_files")
    else:
        # Handle JSON
        data = await request.json()
        invoice_files = None

    # Update fields
    if "execution_date" in data and data["execution_date"]:
        execution_date = data["execution_date"]
        if isinstance(execution_date, str):
            execution_date = datetime.fromisoformat(execution_date.replace("Z", "+00:00"))
        maintenance.execution_date = execution_date

    if "mileage_at_intervention" in data:
        mileage = int(data["mileage_at_intervention"]) if data["mileage_at_intervention"] else 0
        if mileage > 0:
            maintenance.mileage_at_intervention = mileage
            # Update vehicle mileage if higher
            if mileage > vehicle.current_mileage:
                vehicle.current_mileage = mileage

    if "cost_paid" in data:
        cost = data.get("cost_paid")
        maintenance.cost_paid = float(cost) if cost else None

    if "notes" in data:
        maintenance.notes = data.get("notes")

    # Handle new invoice files if provided
    if invoice_files:
        for file in invoice_files:
            if file.filename and file.filename.strip():
                try:
                    file_data = await file.read()

                    if len(file_data) > MAX_INVOICE_SIZE_BYTES:
                        raise HTTPException(status_code=400, detail="Un fichier de facture dépasse 10 Mo")

                    invoice_mime = (getattr(file, "content_type", None) or "application/octet-stream").lower()
                    if invoice_mime not in ALLOWED_INVOICE_MIME_TYPES:
                        raise HTTPException(status_code=400, detail="Type de fichier non supporté (PDF, JPG, PNG, WEBP uniquement)")

                    safe_name = Path(file.filename).name
                    extension = Path(safe_name).suffix or ".bin"
                    stored_name = f"{vehicle_id}_{maintenance_id}_{uuid.uuid4().hex}{extension}"
                    INVOICE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
                    stored_path = INVOICE_STORAGE_DIR / stored_name
                    stored_path.write_bytes(file_data)
                    
                    # Create invoice record
                    invoice = MaintenanceInvoice(
                        maintenance_id=maintenance.id,
                        filename=safe_name,
                        file_path=str(stored_path),
                        mime_type=invoice_mime,
                        file_size=len(file_data),
                    )
                    db.add(invoice)
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Failed to save invoice file: {e}")
                    raise HTTPException(status_code=400, detail=f"Failed to save file: {safe_name}")

    vehicle.updated_at = datetime.now(timezone.utc)
    maintenance.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(maintenance)

    # Clear notification logs so reminders restart for this intervention
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)

    # Immediately check and send notifications for this vehicle
    try:
        await _check_vehicle_reminders(vehicle, db)
    except Exception:
        logger.warning("Failed to trigger immediate reminder check for vehicle %s", vehicle_id)

    payload = maintenance.to_dict()
    # Add invoice download URLs
    for invoice in payload.get("invoices", []):
        invoice["download_url"] = f"/vehicles/{vehicle_id}/maintenances/{maintenance.id}/invoices/{invoice['id']}"
    
    return payload


@router.delete("/{vehicle_id}/maintenances/{maintenance_id}")
def delete_maintenance(
    vehicle_id: int,
    maintenance_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a maintenance record and all associated invoices."""
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id,
        Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    maintenance = db.query(Maintenance).filter(
        Maintenance.id == maintenance_id,
        Maintenance.vehicle_id == vehicle_id,
    ).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")

    # Delete all associated invoice files
    for invoice in maintenance.invoices:
        if invoice.file_path:
            secure_delete(invoice.file_path)

    # Clear notification logs so reminders restart for the next cycle
    clear_notification_logs_for(vehicle_id, maintenance.intervention_type, db)

    db.delete(maintenance)
    db.commit()
    return {"detail": "Maintenance deleted"}


@router.get("/{vehicle_id}/maintenances/{maintenance_id}/invoices/{invoice_id}")
def download_maintenance_invoice(
    vehicle_id: int, 
    maintenance_id: int, 
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a specific invoice for a maintenance record."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    maintenance = db.query(Maintenance).filter(
        Maintenance.id == maintenance_id,
        Maintenance.vehicle_id == vehicle_id,
    ).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance not found")

    invoice = db.query(MaintenanceInvoice).filter(
        MaintenanceInvoice.id == invoice_id,
        MaintenanceInvoice.maintenance_id == maintenance_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_file = Path(invoice.file_path)
    if not invoice_file.exists():
        raise HTTPException(status_code=404, detail="Invoice file not found on disk")

    return FileResponse(
        path=str(invoice_file),
        media_type=invoice.mime_type or "application/octet-stream",
        filename=invoice.filename or invoice_file.name,
    )


def _compute_upcoming(vehicle: Vehicle, db: Session) -> dict:
    """Compute upcoming maintenances for a vehicle (internal, no auth check)."""
    last_maintenances = {}
    all_maintenances = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle.id).all()

    for maintenance in all_maintenances:
        key = get_intervention_key(maintenance.intervention_type)
        current_last = last_maintenances.get(key)

        if current_last is None or maintenance.execution_date > current_last[0]:
            last_maintenances[key] = (maintenance.execution_date, maintenance.mileage_at_intervention)

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

    maintenance_category = calculator.get_maintenance_category(
        vehicle.vehicle_type,
        vehicle.brand,
        vehicle.year
    )
    for item in upcoming:
        cost_est = calculator.get_estimated_cost(
            vehicle.vehicle_type,
            item["intervention_type"],
            vehicle.displacement,
            maintenance_category,
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

    return {
        "vehicle_id": vehicle.id,
        "upcoming": upcoming,
    }


@router.get("/{vehicle_id}/upcoming")
def get_upcoming_maintenances(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get upcoming maintenances for a vehicle, prioritized by urgency."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return _compute_upcoming(vehicle, db)


@router.get("/{vehicle_id}/recommendations")
def get_recommendations(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get contextual recommendations for a vehicle."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    recommendations = []

    # Check age
    vehicle_age = datetime.now(timezone.utc).year - vehicle.year
    if vehicle_age > 10:
        # Check if timing belt ever recorded
        timings = db.query(Maintenance).filter(
            Maintenance.vehicle_id == vehicle_id,
            Maintenance.intervention_type.ilike("%timing%")
        ).all()

        if not timings:
            recommendations.append({
                "type": "warning",
                "message": f"Ce véhicule a {vehicle_age} ans. Aucun remplacement de courroie de distribution enregistré. C'est une intervention critique. Vérifiez l'historique d'entretien.",
            })

    # Check for upcoming urgent maintenances
    upcoming_response = _compute_upcoming(vehicle, db)
    upcoming = upcoming_response["upcoming"]

    urgent_count = sum(1 for u in upcoming if u["status"] == "urgent")
    if urgent_count >= 2:
        costs = sum(u.get("estimated_cost_max", 0) or 0 for u in upcoming if u["status"] == "urgent")
        recommendations.append({
            "type": "warning",
            "message": f"Plusieurs entretiens urgents détectés ({urgent_count} interventions). Envisagez de les regrouper pour réduire les coûts de main-d'œuvre. Total estimé : {costs:.0f} €.",
        })

    # Check overdue
    overdue_count = sum(1 for u in upcoming if u["status"] == "overdue")
    if overdue_count > 0:
        recommendations.append({
            "type": "error",
            "message": f"{overdue_count} entretien(s) en retard. Veuillez les effectuer dès que possible.",
        })

    return {
        "vehicle_id": vehicle_id,
        "recommendations": recommendations,
    }


@router.get("/{vehicle_id}/cost-forecast")
def get_cost_forecast(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get estimated maintenance costs for the next 12 months."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    upcoming_response = _compute_upcoming(vehicle, db)
    upcoming = upcoming_response["upcoming"]

    total_min = sum(u.get("estimated_cost_min", 0) or 0 for u in upcoming)
    total_max = sum(u.get("estimated_cost_max", 0) or 0 for u in upcoming)

    return {
        "vehicle_id": vehicle_id,
        "total_cost_min": total_min,
        "total_cost_max": total_max,
        "upcoming_count": len(upcoming),
        "urgent_count": sum(1 for u in upcoming if u["status"] in ["overdue", "urgent"]),
    }
