from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from models import Vehicle, Maintenance, User, get_db
from security import get_current_user
from datetime import datetime, timezone
from typing import Dict
import csv
import re
from io import StringIO, BytesIO
import zipfile
from pathlib import Path

router = APIRouter(prefix="/vehicles", tags=["exports"])


def _get_vehicle_for_user(vehicle_id: int, current_user: User, db: Session) -> Vehicle:
    """Récupère un véhicule en vérifiant que l'utilisateur en est propriétaire."""
    if current_user.is_integration_account:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    else:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id,
            Vehicle.user_id == current_user.id
        ).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle






@router.get("/{vehicle_id}/estimate")
def get_vehicle_value_estimate(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Estimation de la valeur actuelle du véhicule.
    Basée sur: prix d'achat ou catégorie, âge, kilométrage,
    motorisation, historique d'entretien.
    """
    vehicle = _get_vehicle_for_user(vehicle_id, current_user, db)

    if not vehicle.purchase_price:
        return {
            "vehicle_id": vehicle_id,
            "estimated_value": None,
            "purchase_price": None,
            "disclaimer": "Aucun prix d'achat renseigné pour ce véhicule.",
        }

    return {
        "vehicle_id": vehicle_id,
        "estimated_value": vehicle.purchase_price,
        "purchase_price": vehicle.purchase_price,
        "disclaimer": "Valeur basée sur le prix d'achat.",
    }


@router.get("/{vehicle_id}/recap")
def get_maintenance_recap(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full maintenance history recap with document information."""
    vehicle = _get_vehicle_for_user(vehicle_id, current_user, db)

    maintenances = (
        db.query(Maintenance)
        .filter(Maintenance.vehicle_id == vehicle_id)
        .order_by(Maintenance.execution_date.desc())
        .all()
    )

    total_cost = sum(m.cost_paid or 0 for m in maintenances)
    cost_by_category = {"scheduled": 0.0, "repair": 0.0, "modification": 0.0}
    count_by_category = {"scheduled": 0, "repair": 0, "modification": 0}
    for m in maintenances:
        cat = m.maintenance_category or "scheduled"
        cost_by_category[cat] = cost_by_category.get(cat, 0) + (m.cost_paid or 0)
        count_by_category[cat] = count_by_category.get(cat, 0) + 1
    items = []
    for m in maintenances:
        # Get invoice info from invoice relationship
        invoice_details = []
        if m.invoices:
            for inv in m.invoices:
                invoice_details.append({
                    "filename": inv.filename,
                    "id": inv.id,
                    "download_url": f"/vehicles/{vehicle_id}/maintenances/{m.id}/invoice"
                })
        
        items.append({
            "id": m.id,
            "intervention_type": m.intervention_type,
            "execution_date": m.execution_date.isoformat(),
            "mileage_at_intervention": m.mileage_at_intervention,
            "cost_paid": m.cost_paid,
            "notes": m.notes,
            "maintenance_category": m.maintenance_category or "scheduled",
            "other_description": m.other_description,
            "has_invoice": len(m.invoices or []) > 0,
            "invoice_count": len(m.invoices or []),
            "invoices": invoice_details,
        })

    return {
        "vehicle_id": vehicle_id,
        "vehicle_name": f"{vehicle.brand} {vehicle.model}",
        "vehicle_type": vehicle.vehicle_type,
        "vehicle_year": vehicle.year,
        "current_mileage": vehicle.current_mileage,
        "total_interventions": len(maintenances),
        "total_cost": round(total_cost, 2),
        "cost_by_category": {k: round(v, 2) for k, v in cost_by_category.items()},
        "count_by_category": count_by_category,
        "documents_count": sum(len(m.invoices or []) for m in maintenances),
        "maintenances": items,
    }


@router.get("/{vehicle_id}/recap/download")
def download_maintenance_recap_zip(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a ZIP with the CSV recap + all attached invoices organized by type and date."""
    vehicle = _get_vehicle_for_user(vehicle_id, current_user, db)

    maintenances = (
        db.query(Maintenance)
        .filter(Maintenance.vehicle_id == vehicle_id)
        .order_by(Maintenance.execution_date)
        .all()
    )

    # Helper function to get folder name from intervention type and date
    def get_folder_name(maintenance):
        # Use intervention type (or custom title for "Autre")
        if maintenance.intervention_type == "Autre" and maintenance.other_description:
            intervention_name = maintenance.other_description
        else:
            intervention_name = maintenance.intervention_type
        
        date_str = maintenance.execution_date.strftime("%d-%m-%Y")
        return f"{intervention_name} - {date_str}"

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # CSV summary
        csv_buf = StringIO()
        writer = csv.DictWriter(
            csv_buf,
            fieldnames=["Date", "Catégorie", "Intervention", "Kilométrage", "Coût (€)", "Notes", "Document"],
        )
        writer.writeheader()
        for m in maintenances:
            category = m.maintenance_category or "scheduled"
            category_display = {
                "scheduled": "Entretien",
                "repair": "Réparation",
                "modification": "Modification véhicule",
            }.get(category, category)
            
            # For "Autre" intervention, show custom title instead of type
            intervention_display = m.other_description if m.intervention_type == "Autre" and m.other_description else m.intervention_type
            
            # Count invoices
            invoice_count = len(m.invoices) if m.invoices else 0
            invoice_display = f"{invoice_count} facture(s)" if invoice_count > 0 else ""
            
            writer.writerow({
                "Date": m.execution_date.strftime("%Y-%m-%d"),
                "Catégorie": category_display,
                "Intervention": intervention_display,
                "Kilométrage": m.mileage_at_intervention,
                "Coût (€)": f"{m.cost_paid:.2f}" if m.cost_paid else "",
                "Notes": m.notes or "",
                "Document": invoice_display,
            })
        zf.writestr("recapitulatif_entretiens.csv", csv_buf.getvalue())

        # Attached invoices organized by type and date
        for m in maintenances:
            if m.invoices:  # Check if there are associated invoices
                for invoice in m.invoices:
                    fp = Path(invoice.file_path)
                    if fp.exists():
                        # Create folder name: "intervention - dd-mm-yyyy"
                        folder_name = get_folder_name(m)
                        
                        # Clean folder name for filesystem compatibility
                        folder_name = folder_name.replace("/", "-").replace(":", "-")
                        
                        arc_name = f"{folder_name}/{invoice.filename}"
                        zf.write(str(fp), arc_name)

    buf.seek(0)
    vehicle_label = f"{vehicle.brand}_{vehicle.model}".replace(" ", "_")
    filename = f"suivi_{vehicle_label}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _slugify_ha(name: str) -> str:
    """Convert a vehicle name to a Home Assistant entity slug.
    
    HA converts sensor names to entity IDs by:
    - lowercasing
    - replacing spaces and special chars with underscores
    - removing accents (à→a, é→e, etc.)
    - stripping leading/trailing underscores
    """
    import unicodedata
    # Normalize unicode and strip accents
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_str.lower()).strip("_")


@router.get("/{vehicle_id}/ha-dashboard-card")
def generate_ha_dashboard_card(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a ready-to-paste Lovelace dashboard card YAML for a vehicle.
    Uses Mushroom cards with card_mod for a polished maintenance dashboard.
    Requires: mushroom cards + card_mod installed via HACS.
    """
    vehicle = _get_vehicle_for_user(vehicle_id, current_user, db)

    slug = _slugify_ha(vehicle.name)
    icon = "mdi:motorbike" if vehicle.vehicle_type == "motorcycle" else "mdi:car"

    sensor_upcoming = f"sensor.{slug}_maintenance_a_venir"
    sensor_overdue = f"sensor.{slug}_maintenance_en_retard"

    lines = []

    # ── Header ──────────────────────────────────────────────────────────
    lines.append("type: vertical-stack")
    lines.append("cards:")
    lines.append("  - type: custom:mushroom-title-card")
    lines.append(f"    title: {icon.replace('mdi:', '')} {vehicle.name}")
    vehicle_icon = "🏍️" if vehicle.vehicle_type == "motorcycle" else "🚗"
    lines[3] = f"    title: {vehicle_icon} {vehicle.name}"
    lines.append("    subtitle: Gestion maintenance")

    # ── Chips (counters) ────────────────────────────────────────────────
    lines.append("  - type: custom:mushroom-chips-card")
    lines.append("    chips:")
    lines.append("      - type: template")
    lines.append("        icon: mdi:alert")
    lines.append("        icon_color: red")
    lines.append("        content: >-")
    lines.append(f"          {{{{ state_attr('{sensor_overdue}',")
    lines.append(f"          'count') | default(0) }}}} en retard")
    lines.append("      - type: template")
    lines.append("        icon: mdi:alert-outline")
    lines.append("        icon_color: orange")
    lines.append("        content: >-")
    lines.append(f"          {{{{ state_attr('{sensor_upcoming}',")
    lines.append(f"          'count') | default(0) }}}} à venir")

    # ── Upcoming maintenance section ────────────────────────────────────
    lines.append("  - type: custom:mushroom-title-card")
    lines.append("    title: 🟠 Entretiens à venir")
    lines.append("  - type: vertical-stack")
    lines.append("    cards:")

    # "All clear" card
    lines.append("      - type: custom:mushroom-template-card")
    lines.append("        primary: ✅ Aucun entretien à venir")
    lines.append("        secondary: Tous les entretiens sont à jour ✨")
    lines.append("        icon: mdi:check-circle")
    lines.append("        icon_color: green")
    lines.append("        card_mod:")
    lines.append("          style: |")
    lines.append("            :host {")
    lines.append(f"              display: {{{{ 'block' if (state_attr('{sensor_upcoming}', 'maintenances') or []) | length == 0 else 'none' }}}};")
    lines.append("            }")
    lines.append("            ha-card {")
    lines.append("              background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.05) 100%);")
    lines.append("              border-left: 4px solid #4caf50;")
    lines.append("              border-radius: 8px;")
    lines.append("            }")

    # Items 0-9
    for i in range(10):
        margin = "              margin-bottom: 8px;" if i < 9 else ""
        lines.append("      - type: custom:mushroom-template-card")
        lines.append("        primary: >")
        lines.append(f"          {{%- set items =")
        lines.append(f"          state_attr('{sensor_upcoming}',")
        lines.append(f"          'maintenances') or [] -%}} {{{{ items[{i}].intervention_type if items |")
        lines.append(f"          length > {i} else '' }}}}")
        lines.append("        secondary: >")
        lines.append(f"          {{%- set items =")
        lines.append(f"          state_attr('{sensor_upcoming}',")
        lines.append(f"          'maintenances') or [] -%}} {{%- if items | length > {i} -%}}")
        lines.append(f"            {{%- set m = items[{i}] -%}}")
        lines.append(f"            {{%- if m.km_remaining != 999999 -%}}📏 {{{{ m.km_remaining }}}} km • {{%- endif -%}}")
        lines.append(f"            {{%- if m.days_remaining != 999999 -%}}📅 {{{{ m.days_remaining }}}} j • {{%- endif -%}}")
        lines.append(f"            💰 {{{{ m.estimated_cost_min }}}}€–{{{{ m.estimated_cost_max }}}}€")
        lines.append(f"          {{%- endif -%}}")
        lines.append("        icon: mdi:alert-outline")
        lines.append("        icon_color: orange")
        lines.append("        card_mod:")
        lines.append("          style: |")
        lines.append("            :host {")
        lines.append(f"              display: {{{{ 'block' if (state_attr('{sensor_upcoming}', 'maintenances') or []) | length > {i} else 'none' }}}};")
        lines.append("            }")
        lines.append("            ha-card {")
        lines.append("              background: linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 152, 0, 0.05) 100%);")
        lines.append("              border-left: 4px solid #ff9800;")
        lines.append("              border-radius: 8px;")
        if margin:
            lines.append(margin)
        lines.append("            }")

    # ── Overdue maintenance section ─────────────────────────────────────
    lines.append("  - type: custom:mushroom-title-card")
    lines.append("    title: 🔴 Entretiens en retard")
    lines.append("  - type: vertical-stack")
    lines.append("    cards:")

    # "All clear" card
    lines.append("      - type: custom:mushroom-template-card")
    lines.append("        primary: ✅ Aucun entretien en retard")
    lines.append("        secondary: Tout est à jour ! 🎉")
    lines.append("        icon: mdi:check-circle")
    lines.append("        icon_color: green")
    lines.append("        card_mod:")
    lines.append("          style: |")
    lines.append("            :host {")
    lines.append(f"              display: {{{{ 'block' if (state_attr('{sensor_overdue}', 'maintenances') or []) | length == 0 else 'none' }}}};")
    lines.append("            }")
    lines.append("            ha-card {")
    lines.append("              background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.05) 100%);")
    lines.append("              border-left: 4px solid #4caf50;")
    lines.append("              border-radius: 8px;")
    lines.append("            }")

    # Items 0-9
    for i in range(10):
        margin = "              margin-bottom: 8px;" if i < 9 else ""
        lines.append("      - type: custom:mushroom-template-card")
        lines.append("        primary: >")
        lines.append(f"          {{%- set items =")
        lines.append(f"          state_attr('{sensor_overdue}',")
        lines.append(f"          'maintenances') or [] -%}} {{{{ items[{i}].intervention_type if items |")
        lines.append(f"          length > {i} else '' }}}}")
        lines.append("        secondary: >")
        lines.append(f"          {{%- set items =")
        lines.append(f"          state_attr('{sensor_overdue}',")
        lines.append(f"          'maintenances') or [] -%}} {{%- if items | length > {i} -%}}")
        lines.append(f"            {{%- set m = items[{i}] -%}}")
        lines.append(f"            {{%- if m.km_remaining != 999999 -%}}📏 {{{{ (m.km_remaining | abs) }}}} km • {{%- endif -%}}")
        lines.append(f"            {{%- if m.days_remaining != 999999 -%}}📅 {{{{ (m.days_remaining | abs) }}}} j • {{%- endif -%}}")
        lines.append(f"            💰 {{{{ m.estimated_cost_min }}}}€–{{{{ m.estimated_cost_max }}}}€")
        lines.append(f"          {{%- endif -%}}")
        lines.append("        icon: mdi:alert")
        lines.append("        icon_color: red")
        lines.append("        card_mod:")
        lines.append("          style: |")
        lines.append("            :host {")
        lines.append(f"              display: {{{{ 'block' if (state_attr('{sensor_overdue}', 'maintenances') or []) | length > {i} else 'none' }}}};")
        lines.append("            }")
        lines.append("            ha-card {")
        lines.append("              background: linear-gradient(135deg, rgba(244, 67, 54, 0.1) 0%, rgba(244, 67, 54, 0.05) 100%);")
        lines.append("              border-left: 4px solid #f44336;")
        lines.append("              border-radius: 8px;")
        if margin:
            lines.append(margin)
        lines.append("            }")

    return {"yaml": "\n".join(lines), "vehicle_name": vehicle.name, "sensor_upcoming": sensor_upcoming, "sensor_overdue": sensor_overdue}