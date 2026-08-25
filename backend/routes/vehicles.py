import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import httpx

from models import Vehicle, Maintenance, FuelLog, User, VehicleMaintenanceOverride, get_db
from security import get_current_user
from routes import secure_delete
from routes.access import (
    get_owned_vehicle,
    get_readable_vehicle,
    list_owned_vehicles,
    list_readable_vehicles,
)
from schemas import VehicleCreate, VehicleUpdate
from maintenance_calculator import MaintenanceCalculator, build_last_maintenances_dict
from regions import format_model_text, get_region

PHOTO_STORAGE_DIR = Path(os.getenv("PHOTO_STORAGE_DIR", "/data/photos"))
ALLOWED_PHOTO_MIME = {"image/jpeg", "image/png", "image/webp"}
PHOTO_MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB

logger = logging.getLogger("ridelog.vehicles")
router = APIRouter(prefix="/vehicles", tags=["vehicles"])
planning_calculator = MaintenanceCalculator()
@router.get("/brand-service-defaults")
def get_brand_service_defaults(
    brand: str = Query(..., min_length=1),
    displacement: int = Query(None, ge=50, le=5000),
    current_user: User = Depends(get_current_user),
):
    """Get default service interval for a motorcycle brand and displacement."""
    defaults = planning_calculator.get_brand_service_interval(brand, displacement)
    return defaults


@router.get("/planning")
def get_planning(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get upcoming and overdue maintenances for all user vehicles."""
    vehicles = list_owned_vehicles(current_user, db)

    # Charger tous les overrides en une seule requête
    vehicle_ids = [v.id for v in vehicles]
    all_overrides = db.query(VehicleMaintenanceOverride).filter(
        VehicleMaintenanceOverride.vehicle_id.in_(vehicle_ids)
    ).all() if vehicle_ids else []

    overrides_by_vehicle = {}
    for o in all_overrides:
        overrides_by_vehicle.setdefault(o.vehicle_id, {})[o.intervention_key] = o

    all_items = []
    for vehicle in vehicles:
        all_maintenances = db.query(Maintenance).filter(Maintenance.vehicle_id == vehicle.id).all()
        # Cette boucle était recopiée à la main ici, sans le traitement des
        # sous-interventions : un remplacement de freins enregistré à
        # l'intérieur d'une révision comptait comme fait dans « À venir » mais
        # pas dans le planning global, qui l'affichait encore comme dû.
        last_maintenances = build_last_maintenances_dict(all_maintenances)

        vehicle_overrides = overrides_by_vehicle.get(vehicle.id, {})

        upcoming = planning_calculator.get_all_upcoming_maintenances(
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
        )

        maintenance_category = planning_calculator.get_maintenance_category(
            vehicle.vehicle_type, vehicle.brand, vehicle.year
        )
        for item in upcoming:
            cost_est = planning_calculator.get_estimated_cost(
                vehicle.vehicle_type, item["intervention_type"],
                vehicle.displacement, maintenance_category,
                brand=vehicle.brand,
                service_interval_km=vehicle.service_interval_km,
                service_interval_months=vehicle.service_interval_months,
            )
            item["estimated_cost_min"] = cost_est.get("min") if cost_est else None
            item["estimated_cost_max"] = cost_est.get("max") if cost_est else None
            item["vehicle_id"] = vehicle.id
            item["vehicle_name"] = vehicle.name or f"{vehicle.brand} {vehicle.model}"
            item["vehicle_type"] = vehicle.vehicle_type
            all_items.append(item)

    for item in all_items:
        if item.get("next_due_date"):
            item["estimated_date"] = item["next_due_date"][:10]
        else:
            item["estimated_date"] = None

    status_order = {"overdue": 0, "urgent": 1, "warning": 2, "ok": 3}
    all_items.sort(key=lambda x: (status_order.get(x.get("status"), 4), x.get("days_remaining", 999999)))

    return {
        "total_items": len(all_items),
        "items": all_items,
    }


@router.get("")
def list_vehicles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = None
):
    vehicles = list_readable_vehicles(current_user, db)
    return [v.to_dict() for v in vehicles]


@router.post("", status_code=201)
def create_vehicle(
    data: VehicleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = None
):
    vehicle = Vehicle(
        name=data.name,
        vehicle_type=data.vehicle_type,
        brand=data.brand,
        model=data.model,
        year=data.year,
        registration_date=data.registration_date,
        motorization=data.motorization,
        displacement=data.displacement,
        range_category=data.range_category,
        current_mileage=data.current_mileage,
        purchase_price=data.purchase_price,
        service_interval_km=data.service_interval_km,
        service_interval_months=data.service_interval_months,
        notes=data.notes,
        is_private=data.is_private,
        user_id=current_user.id
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    logger.info("Vehicle created: %s %s (id=%d) for user_id=%d", vehicle.brand, vehicle.model, vehicle.id, current_user.id)
    return vehicle.to_dict()


@router.post("/decode-vin")
def decode_vin(
    vin: str,
    current_user: User = Depends(get_current_user),
):
    vin = vin.strip().upper()
    
    if len(vin) != 17:
        raise HTTPException(status_code=400, detail="VIN must be 17 characters long")
    
    try:
        url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json"
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("Results"):
            raise HTTPException(status_code=400, detail="Invalid VIN or vehicle not found")
        
        results = {item["Variable"]: item["Value"] for item in data["Results"]}
        
        def _val(key: str) -> str:
            v = (results.get(key) or "").strip()
            return "" if v.lower() in ("not applicable", "null", "n/a") else v

        brand = _val("Make")
        model = _val("Model")
        year = _val("Model Year")
        engine_displacement = _val("Displacement (CC)") or _val("Engine Displacement (CC)")
        engine_type = _val("Fuel Type - Primary") or _val("Fuel Type Primary")
        vehicle_type_raw = _val("Vehicle Type").lower()
        series = _val("Series")
        series2 = _val("Series2")
        trim = _val("Trim")
        trim2 = _val("Trim2")
        body_class = _val("Body Class")
        cylinders = _val("Engine Number of Cylinders")
        engine_hp = _val("Engine Brake (Hp) From")
        engine_kw = _val("Engine KW")
        
        if not brand:
            raise HTTPException(status_code=400, detail="Impossible d'extraire la marque depuis ce VIN")
        
        if not model:
            parts = [p for p in [series, series2, trim, trim2] if p]
            model = " ".join(parts)
        
        motorization_map = {
            "Gasoline": "essence",
            "Diesel": "diesel",
            "Electric": "electric",
            "Hybrid": "hybrid",
            "CNG": "essence",
        }
        
        motorization = "essence"
        for fuel_key, fuel_value in motorization_map.items():
            if fuel_key.lower() in engine_type.lower():
                motorization = fuel_value
                break
        
        detected_type = "car"
        if any(kw in vehicle_type_raw for kw in ["motorcycle", "moto"]):
            detected_type = "motorcycle"
            if motorization == "essence":
                motorization = "thermal"
        elif any(kw in body_class.lower() for kw in ["motorcycle", "moto"]):
            detected_type = "motorcycle"
            if motorization == "essence":
                motorization = "thermal"
        
        displacement = None
        if engine_displacement:
            try:
                displacement = int(float(engine_displacement.replace(",", ".")))
            except (ValueError, TypeError):
                pass

        return {
            "brand": brand,
            "model": format_model_text(model),
            "year": int(year) if year and year.isdigit() else None,
            "motorization": motorization,
            "displacement": displacement,
            "vehicle_type": detected_type,
            "engine_info": engine_type or None,
            "cylinders": int(cylinders) if cylinders and cylinders.isdigit() else None,
            "power_hp": int(float(engine_hp)) if engine_hp else (round(float(engine_kw) * 1.341) if engine_kw else None),
        }
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="VIN decoder service timeout, please try again")
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="VIN decoder service unavailable, please enter details manually")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decoding VIN: {str(e)}")


@router.post("/decode-license-plate")
def decode_license_plate(
    plate: str = Query(...),
    vehicle_type_hint: str = Query(None),
    current_user: User = Depends(get_current_user),
):
    region = get_region()
    normalized_plate = region.normalize_plate(plate)
    if not normalized_plate:
        raise HTTPException(
            status_code=400,
            detail=f"Format de plaque invalide. Exemple attendu: {region.plate_example}",
        )

    rapidapi_key = os.getenv("RAPIDAPI_KEY")
    direct_token = os.getenv("PLATE_API_TOKEN")

    if not rapidapi_key and not direct_token:
        raise HTTPException(
            status_code=503,
            detail=(
                "Aucune clé API plaque configurée. "
                "Ajoutez RAPIDAPI_KEY (gratuit, 10 req/mois sur rapidapi.com) "
                "ou PLATE_API_TOKEN (api.apiplaqueimmatriculation.com) "
                "dans vos variables d'environnement, "
                "ou utilisez le décodage VIN (gratuit, sans inscription)."
            ),
        )

    try:
        if rapidapi_key:
            url = "https://api-plaque-immatriculation-siv.p.rapidapi.com/get-vehicule-info"
            response = httpx.get(
                url,
                params={
                    "immatriculation": normalized_plate,
                    "token": "TokenDemoRapidapi",
                    "host_name": "https://apiplaqueimmatriculation.com",
                },
                headers={
                    "X-RapidAPI-Key": rapidapi_key,
                    "X-RapidAPI-Host": "api-plaque-immatriculation-siv.p.rapidapi.com",
                    "Accept": "application/json",
                },
                timeout=15.0,
            )
            provider = "rapidapi"
        else:
            url = "https://api.apiplaqueimmatriculation.com/plaque"
            response = httpx.post(
                url,
                params={
                    "immatriculation": normalized_plate,
                    "token": direct_token,
                    "pays": "FR",
                },
                headers={"Accept": "application/json"},
                timeout=12.0,
            )
            provider = "direct"

        if response.status_code != 200:
            try:
                body = response.json()
                api_msg = body.get("message", "")
            except Exception:
                api_msg = ""

            if response.status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="Quota API plaque atteint pour ce mois. Réessayez le mois prochain ou utilisez le décodage VIN (gratuit).",
                )
            if response.status_code == 401 or "token" in api_msg.lower() or "expir" in api_msg.lower():
                if provider == "rapidapi":
                    detail = (
                        "Clé RapidAPI invalide ou expirée. "
                        "Vérifiez votre RAPIDAPI_KEY et votre abonnement sur rapidapi.com."
                    )
                else:
                    detail = (
                        "Token API plaque expiré ou invalide. "
                        "Configurez PLATE_API_TOKEN avec un token valide "
                        "(https://api.apiplaqueimmatriculation.com)."
                    )
                raise HTTPException(status_code=401, detail=detail)
            raise HTTPException(
                status_code=response.status_code,
                detail=api_msg or "Service de plaque indisponible, veuillez saisir manuellement",
            )

        data = response.json()

        if "error" in data and data["error"]:
            raise HTTPException(status_code=400, detail=str(data["error"]))

        parsed = region.parse_plate_response(data, vehicle_type_hint=vehicle_type_hint)
        if not parsed.get("brand") or not parsed.get("model"):
            raise HTTPException(status_code=404, detail="Aucune donnée exploitable trouvée pour cette plaque")

        parsed["license_plate"] = normalized_plate
        parsed["source"] = f"apiplaqueimmatriculation.com ({provider})"
        return parsed

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Service de plaque temporairement indisponible (timeout)")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Impossible de contacter le service de plaque. Vérifiez votre connexion.")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Plate decode error for %s", normalized_plate)
        raise HTTPException(status_code=500, detail=f"Erreur de décodage de plaque: {str(e)}")


@router.post("/suggest-category")
def suggest_category(
    brand: str,
    year: int,
    vehicle_type: str = "car",
    purchase_price: float = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from maintenance_calculator import calculator
    suggested_category = calculator.auto_categorize_vehicle(
        brand=brand,
        year=year,
        purchase_price=purchase_price,
        vehicle_type=vehicle_type
    )
    price_info = f"price {int(purchase_price)}EUR" if purchase_price else "market positioning"
    return {
        "suggested_category": suggested_category,
        "reason": f"Auto-categorized {brand} ({year}) based on brand reputation and {price_info}"
    }


@router.get("/{vehicle_id}")
def get_vehicle(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = None
):
    vehicle = get_readable_vehicle(vehicle_id, current_user, db)
    return vehicle.to_dict()


@router.put("/{vehicle_id}")
def update_vehicle(
    vehicle_id: int,
    data: VehicleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = None
):
    vehicle = get_owned_vehicle(vehicle_id, current_user, db)

    if data.name is not None:
        vehicle.name = data.name
    if data.year is not None:
        vehicle.year = data.year
    if data.is_private is not None:
        vehicle.is_private = data.is_private
    if data.registration_date is not None:
        vehicle.registration_date = data.registration_date
    if data.current_mileage is not None and data.current_mileage != vehicle.current_mileage:
        if data.current_mileage < vehicle.current_mileage:
            max_maintenance_km = db.query(
                Maintenance.mileage_at_intervention
            ).filter(
                Maintenance.vehicle_id == vehicle_id
            ).order_by(Maintenance.mileage_at_intervention.desc()).first()

            max_fuel_km = db.query(
                FuelLog.mileage_at_fill
            ).filter(
                FuelLog.vehicle_id == vehicle_id
            ).order_by(FuelLog.mileage_at_fill.desc()).first()

            blocking_km = max(
                max_maintenance_km[0] if max_maintenance_km else 0,
                max_fuel_km[0] if max_fuel_km else 0,
            )

            if data.current_mileage < blocking_km:
                raise HTTPException(
                    status_code=400,
                    detail=f"Impossible de réduire le kilométrage en dessous de {blocking_km:,} km. "
                           f"Un entretien ou un plein a été enregistré à ce kilométrage."
                )
        vehicle.current_mileage = data.current_mileage
    if data.purchase_price is not None:
        vehicle.purchase_price = data.purchase_price
    if data.service_interval_km is not None:
        vehicle.service_interval_km = data.service_interval_km
    if data.service_interval_months is not None:
        vehicle.service_interval_months = data.service_interval_months
    if data.notes is not None:
        vehicle.notes = data.notes

    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vehicle)
    logger.info("Vehicle updated: id=%d", vehicle_id)
    return vehicle.to_dict()


@router.delete("/{vehicle_id}")
def delete_vehicle(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: str = None
):
    vehicle = get_owned_vehicle(vehicle_id, current_user, db)

    if vehicle.photo_path:
        secure_delete(vehicle.photo_path)

    for maintenance in vehicle.maintenances:
        for invoice in maintenance.invoices:
            if invoice.file_path:
                secure_delete(invoice.file_path)

    logger.info("Vehicle deleted: %s %s (id=%d)", vehicle.brand, vehicle.model, vehicle_id)
    db.delete(vehicle)
    db.commit()
    return {"deleted": True}


@router.post("/{vehicle_id}/photo", status_code=201)
async def upload_vehicle_photo(
    vehicle_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicle = get_owned_vehicle(vehicle_id, current_user, db)

    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_PHOTO_MIME:
        raise HTTPException(status_code=400, detail="Type non supporté. Formats acceptés : JPG, PNG, WEBP")

    content = await file.read()
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="La photo dépasse 5 Mo")

    PHOTO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    if vehicle.photo_path:
        secure_delete(vehicle.photo_path)

    ext = Path(file.filename).suffix or ".jpg"
    stored_name = f"vehicle_{vehicle_id}_{uuid.uuid4().hex}{ext}"
    stored_path = PHOTO_STORAGE_DIR / stored_name
    with open(stored_path, "wb") as f:
        f.write(content)

    vehicle.photo_path = str(stored_path)
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vehicle)
    logger.info("Photo uploaded for vehicle id=%d", vehicle_id)
    return vehicle.to_dict()


@router.get("/{vehicle_id}/photo")
def get_vehicle_photo(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sert la photo d'un véhicule — réservée à son propriétaire.

    Cet endpoint était public : une simple boucle sur les identifiants
    permettait de récupérer les photos de tous les véhicules de tous les
    comptes (plaque d'immatriculation et lieu souvent lisibles dessus).
    Il exige désormais un JWT, comme le reste de l'API ; le front ne peut donc
    plus l'utiliser dans un ``<img src>`` et passe par le composant
    ``VehiclePhoto`` qui charge l'image via le client authentifié.
    """
    vehicle = get_readable_vehicle(vehicle_id, current_user, db)
    if not vehicle.photo_path:
        raise HTTPException(status_code=404, detail="Aucune photo pour ce véhicule")

    photo = Path(vehicle.photo_path)
    if not photo.exists():
        raise HTTPException(status_code=404, detail="Fichier photo introuvable")

    # Le type était figé à image/jpeg alors que PNG et WEBP sont acceptés à
    # l'upload — on le déduit de l'extension réellement stockée.
    media_type = PHOTO_MIME_BY_SUFFIX.get(photo.suffix.lower(), "image/jpeg")
    return FileResponse(path=str(photo), media_type=media_type)


@router.delete("/{vehicle_id}/photo")
def delete_vehicle_photo(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vehicle = get_owned_vehicle(vehicle_id, current_user, db)
    if not vehicle.photo_path:
        raise HTTPException(status_code=404, detail="Aucune photo pour ce véhicule")

    secure_delete(vehicle.photo_path)

    vehicle.photo_path = None
    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vehicle)
    logger.info("Photo deleted for vehicle id=%d", vehicle_id)
    return vehicle.to_dict()