"""
Lecture de plaque française.

Cette logique était noyée dans routes/vehicles.py, donc atteignable seulement
via un appel HTTP vers un service tiers payant — autant dire jamais testée.
L'avoir isolée dans regions/fr.py la rend vérifiable hors ligne, et c'est ce
qui rendra un second pays sûr à ajouter : ces mêmes tests s'écriront pour lui.
"""

import pytest

from regions import get_region, to_int, format_model_text
from regions import fr


# ═══════════════════════════════════════════════════════════════════════════
# Registre
# ═══════════════════════════════════════════════════════════════════════════

def test_france_is_the_default_region():
    assert get_region().code == "FR"


def test_unknown_region_code_falls_back_instead_of_breaking(monkeypatch):
    """Une variable d'environnement mal orthographiée ne doit pas rendre
    l'instance inutilisable."""
    monkeypatch.setenv("REGION", "ZZ")
    assert get_region().code == "FR"


# ═══════════════════════════════════════════════════════════════════════════
# Normalisation de plaque
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw", ["AB-123-CD", "ab123cd", "AB 123 CD", " ab-123-cd "])
def test_valid_plates_are_normalized_to_the_canonical_form(raw):
    assert fr.normalize_plate(raw) == "AB-123-CD"


@pytest.mark.parametrize("raw", ["", None, "AB-12-CD", "ABC-12-DE", "123-AB-456", "AB-123-C"])
def test_invalid_plates_are_rejected(raw):
    assert fr.normalize_plate(raw) == ""


# ═══════════════════════════════════════════════════════════════════════════
# Analyse de la réponse du service
# ═══════════════════════════════════════════════════════════════════════════

def test_car_response_is_parsed():
    parsed = fr.parse_plate_response({"data": {
        "marque": "PEUGEOT", "modele": "308 sw", "energieNGC": "GAZOLE",
        "genreVCGNGC": "VP", "date1erCir_fr": "15-03-2018", "ccm": "1997",
        "puisFisc": "7 CV",
    }})

    assert parsed["brand"] == "Peugeot"
    assert parsed["model"] == "308 Sw"
    assert parsed["vehicle_type"] == "car"
    assert parsed["motorization"] == "diesel"
    assert parsed["year"] == 2018
    assert parsed["registration_date"] == "2018-03-15"
    assert parsed["displacement"] == 1997
    assert parsed["fiscal_power"] == 7


def test_motorcycle_is_detected_from_the_registration_document_genre():
    parsed = fr.parse_plate_response({"data": {
        "marque": "YAMAHA", "modele": "MT-07", "energieNGC": "ESSENCE",
        "genreVCGNGC": "MTT1", "date1erCir_fr": "01-06-2021", "ccm": "689",
    }})
    assert parsed["vehicle_type"] == "motorcycle"
    # Une moto thermique est rangée sous « thermal », pas « essence ».
    assert parsed["motorization"] == "thermal"


def test_user_hint_only_breaks_a_tie():
    """L'indication de l'utilisateur ne doit jamais contredire un genre carte
    grise explicite — sinon une erreur de saisie écraserait la source fiable."""
    explicit = {"marque": "BMW", "modele": "R1250", "genreVCGNGC": "MTT2"}
    assert fr.parse_plate_response({"data": explicit}, vehicle_type_hint="car")["vehicle_type"] == "motorcycle"

    silent = {"marque": "BMW", "modele": "R1250", "genreVCGNGC": ""}
    assert fr.parse_plate_response({"data": silent}, vehicle_type_hint="motorcycle")["vehicle_type"] == "motorcycle"


def test_displacement_falls_back_to_liters_then_to_the_commercial_name():
    """La carte grise ne porte pas toujours la cylindrée."""
    from_liters = fr.parse_plate_response({"data": {"capacite_litres": "1,6"}})
    assert from_liters["displacement"] == 1600

    from_version = fr.parse_plate_response({"data": {"version": "1.5 dCi"}})
    assert from_version["displacement"] == 1500


def test_missing_fields_do_not_raise():
    parsed = fr.parse_plate_response({})
    assert parsed["brand"] == ""
    assert parsed["year"] is None
    assert parsed["displacement"] is None


# ═══════════════════════════════════════════════════════════════════════════
# Helpers partagés
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw,expected", [
    ("1998 cm3", 1998), ("5,5", 6), (7, 7), ("", None), (None, None), ("abc", None),
])
def test_to_int_extracts_the_first_number(raw, expected):
    assert to_int(raw) == expected


def test_roman_numerals_stay_capitalised():
    assert format_model_text("golf iv") == "Golf IV"
    assert format_model_text("  PEUGEOT   308  ") == "Peugeot 308"
