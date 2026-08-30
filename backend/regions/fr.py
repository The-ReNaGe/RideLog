"""
France — lecture de plaque d'immatriculation (SIV, format AB-123-CD).

Source : api.apiplaqueimmatriculation.com, dont la réponse est en français et
suit la nomenclature de la carte grise (`marque`, `genreVCGNGC`, `date1erCir_fr`,
`puisFisc`…). Aucun de ces champs n'a d'équivalent dans un autre pays : c'est
tout l'intérêt d'isoler ce module.

Ce code a été déplacé tel quel depuis routes/vehicles.py, sans changement de
comportement.
"""

import re

PLATE_REGEX = re.compile(r"^[A-Z]{2}-?\d{3}-?[A-Z]{2}$")

# Genres de la carte grise identifiant un deux-roues motorisé.
MOTORCYCLE_MARKERS = ["moto", "motocyclette", "cyclomoteur", "mtl", "mtt1", "mtt2", "mtt", "cyclo"]
CAR_MARKERS = ["vp", "vtsu", "ctte"]


def normalize_plate(plate: str) -> str:
    """AB-123-CD, quelle que soit la ponctuation saisie. Vide si invalide."""
    normalized = re.sub(r"[^A-Za-z0-9]", "", (plate or "").upper())
    if len(normalized) != 7:
        return ""
    candidate = f"{normalized[0:2]}-{normalized[2:5]}-{normalized[5:7]}"
    return candidate if PLATE_REGEX.match(candidate) else ""


def _parse_displacement_cc(data: dict):
    """Cylindrée en cm³, cherchée dans les champs successifs de la réponse.

    La carte grise ne porte pas toujours la cylindrée : on retombe sur la
    capacité en litres, puis sur la dénomination commerciale, d'où l'empilement.
    """
    from regions import to_int

    ccm = to_int(data.get("ccm") or data.get("cylindree"))
    if ccm and ccm >= 80:
        return ccm

    liters_raw = data.get("capacite_litres")
    if liters_raw is not None:
        as_text = str(liters_raw).replace(",", ".")
        match = re.search(r"\d+(?:\.\d+)?", as_text)
        if match:
            liters = float(match.group(0))
            if 0 < liters < 20:
                return int(round(liters * 1000))

    direct = to_int(data.get("displacement"))
    if direct and direct >= 80:
        return direct

    version = str(data.get("version") or "")
    version_liters = re.search(
        r"(\d+(?:[\.,]\d+)?)\s*(?:dci|tdi|hdi|tsi|tce|l)\b", version, flags=re.IGNORECASE
    )
    if version_liters:
        liters = float(version_liters.group(1).replace(",", "."))
        if 0 < liters < 20:
            return int(round(liters * 1000))

    version_cc = re.search(r"\b(\d{2,4})\s*cc\b", version, flags=re.IGNORECASE)
    if version_cc:
        cc = int(version_cc.group(1))
        if 80 <= cc <= 3000:
            return cc

    sra = str(data.get("sra_commercial") or "")
    if sra:
        sra_cc = re.search(r"\b(\d{3,4})\b", sra)
        if sra_cc:
            cc = int(sra_cc.group(1))
            if 50 <= cc <= 3000:
                return cc

    return None


def parse_plate_response(payload: dict, vehicle_type_hint: str = None) -> dict:
    """Réponse du service français → champs véhicule RideLog."""
    from regions import format_model_text, to_int

    data = payload.get("data", payload)

    brand = format_model_text(data.get("marque") or data.get("brand") or "")
    model = format_model_text(data.get("modele") or data.get("model") or "")
    fuel_raw = (data.get("energieNGC") or data.get("type_moteur") or data.get("energie") or "").lower()
    displacement = _parse_displacement_cc(data)

    genre_raw = " ".join([
        str(data.get("genreVCGNGC") or ""),
        str(data.get("genreVCG") or ""),
        str(data.get("carrosserieCG") or ""),
        str(data.get("carrosserie") or ""),
    ]).lower()

    has_motorcycle_marker = any(marker in genre_raw for marker in MOTORCYCLE_MARKERS)
    has_explicit_car_marker = any(marker in genre_raw for marker in CAR_MARKERS)

    vehicle_type = "motorcycle" if has_motorcycle_marker else "car"

    # L'indication de l'utilisateur ne tranche que si le genre carte grise ne
    # dit rien : une réponse explicite du service prime toujours sur elle.
    genre_is_inconclusive = not has_motorcycle_marker and not has_explicit_car_marker
    if vehicle_type_hint in {"car", "motorcycle"} and vehicle_type != vehicle_type_hint and genre_is_inconclusive:
        vehicle_type = vehicle_type_hint

    year = None
    first_reg = data.get("date1erCir_fr") or data.get("date1erCir_us")
    if isinstance(first_reg, str):
        match = re.search(r"(19|20)\d{2}", first_reg)
        if match:
            year = int(match.group(0))

    if not year:
        start_model = data.get("debut_modele")
        if isinstance(start_model, str):
            match = re.search(r"(19|20)\d{2}", start_model)
            if match:
                year = int(match.group(0))

    motorization = "essence"
    if any(k in fuel_raw for k in ["diesel", "gazole"]):
        motorization = "diesel"
    elif any(k in fuel_raw for k in ["elect", "élect"]):
        motorization = "electric"
    elif "hybrid" in fuel_raw or "hybride" in fuel_raw:
        motorization = "hybrid"

    if vehicle_type == "motorcycle" and motorization != "electric":
        motorization = "thermal"

    registration_date = None
    date_fr = data.get("date1erCir_fr") or ""
    if date_fr:
        parts = date_fr.split("-")
        if len(parts) == 3 and len(parts[2]) == 4:
            registration_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

    sra_commercial = (data.get("sra_commercial") or "").strip()
    vin = (data.get("vin") or "").strip()

    return {
        "brand": brand,
        "model": model,
        "year": year,
        "motorization": motorization,
        "displacement": displacement,
        "vehicle_type": vehicle_type,
        "registration_date": registration_date,
        "fiscal_power": to_int(data.get("puisFisc")),
        "sra_commercial": sra_commercial if sra_commercial else None,
        "vin": vin if vin else None,
        "cylinders": to_int(data.get("cylindres")),
        "source": "api.apiplaqueimmatriculation.com",
    }


def next_inspection_date(vehicle_type, registration_date, last_inspection_date):
    """Prochaine échéance de contrôle technique, règle française.

    Déplacée depuis `maintenance_calculator` : elle y était appliquée à tous
    les véhicules sans condition, alors qu'elle n'a de sens qu'en France. Un
    véhicule immatriculé ailleurs suivra celle de son propre pays.

    Moto :
      - immatriculée en 2020-2021 → 5ᵉ anniversaire + 4 mois, plafonné au
        31/12/2026 (calendrier de rattrapage de l'entrée en vigueur) ;
      - 2022 et après → 5ᵉ anniversaire, puis tous les 3 ans ;
      - avant 2020 → aucune obligation calculable ici.
    Voiture : 4ᵉ anniversaire + 6 mois, puis tous les 2 ans.
    """
    from datetime import datetime

    from dateutil.relativedelta import relativedelta

    if not registration_date:
        return None

    reg_year = registration_date.year

    if vehicle_type == "motorcycle":
        if last_inspection_date is None:
            if reg_year in (2020, 2021):
                fifth = registration_date + relativedelta(years=5)
                return min(fifth + relativedelta(months=4), datetime(2026, 12, 31))
            if reg_year >= 2022:
                return registration_date + relativedelta(years=5)
            return None
        return last_inspection_date + relativedelta(years=3)

    if vehicle_type == "car":
        if last_inspection_date is None:
            return registration_date + relativedelta(years=4) + relativedelta(months=6)
        return last_inspection_date + relativedelta(years=2)

    return None


class _France:
    code = "FR"
    name = "France"
    plate_example = "AB-123-CD"

    # Ce que le pays propose par DÉFAUT, et rien de plus : l'utilisateur peut
    # ensuite choisir autre chose. Une instance française dont le propriétaire
    # préfère l'anglais est un cas parfaitement ordinaire — le pays décide du
    # format de plaque et du calendrier réglementaire, pas de la langue qu'on
    # parle chez soi.
    default_language = "fr"
    default_units = "metric"
    default_currency = "EUR"

    normalize_plate = staticmethod(normalize_plate)
    next_inspection_date = staticmethod(next_inspection_date)
    parse_plate_response = staticmethod(parse_plate_response)


REGION = _France()
