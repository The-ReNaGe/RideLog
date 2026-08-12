"""
Tests unitaires sur maintenance_calculator.py — la logique métier la plus
critique du projet (aucune dépendance DB/HTTP).
"""

from datetime import datetime, timezone

from maintenance_calculator import calculator, get_intervention_key, build_last_maintenances_dict


# ═══════════════════════════════════════════════════════════════════════════
# get_intervals_for_vehicle — logique dynamique moto
# ═══════════════════════════════════════════════════════════════════════════

def test_car_intervals_returned_unmodified():
    """Pour une voiture, get_intervals_for_vehicle renvoie la section 'car' du JSON telle quelle."""
    intervals = calculator.get_intervals_for_vehicle("car")
    assert "oil_change" in intervals
    assert intervals["oil_change"]["km_interval"] == 10000


def test_valve_clearance_is_double_periodic_service():
    """Les soupapes sont vérifiées une révision sur deux (2x l'intervalle de révision)."""
    intervals = calculator.get_intervals_for_vehicle("motorcycle", displacement=600, service_interval_km=10000)
    assert intervals["periodic_service"]["km_interval"] == 10000
    assert intervals["valve_clearance"]["km_interval"] == 20000


def test_oil_change_moto_km_interval_matches_periodic_service():
    """Régression : oil_change_moto doit être suivi au km comme periodic_service.

    Bug historique : le code comparait `key == "oil_change"` au lieu de
    `key == "oil_change_moto"` (la vraie clé JSON), donc cette branche ne se
    déclenchait jamais et km_interval restait à null — la vidange moto n'était
    alors suivie qu'au temps (12 mois), jamais au kilométrage.
    """
    intervals = calculator.get_intervals_for_vehicle("motorcycle", displacement=600, service_interval_km=8000)
    assert intervals["oil_change_moto"]["km_interval"] == 8000
    assert intervals["oil_change_moto"]["months_interval"] == 12


def test_periodic_service_has_no_months_interval():
    """periodic_service est purement kilométrique (months_interval = None)."""
    intervals = calculator.get_intervals_for_vehicle("motorcycle", displacement=600, service_interval_km=10000)
    assert intervals["periodic_service"]["months_interval"] is None


def test_annual_service_always_12_months_regardless_of_brand_interval():
    """annual_service reste toujours fixé à 12 mois, peu importe l'intervalle de révision choisi."""
    intervals = calculator.get_intervals_for_vehicle("motorcycle", displacement=1200, service_interval_km=20000)
    assert intervals["annual_service"]["months_interval"] == 12


def test_explicit_service_interval_km_overrides_brand_default():
    """Un service_interval_km fourni explicitement prime sur les valeurs par défaut de la marque."""
    default = calculator.get_intervals_for_vehicle("motorcycle", displacement=600, brand="Honda")
    overridden = calculator.get_intervals_for_vehicle(
        "motorcycle", displacement=600, brand="Honda", service_interval_km=7777
    )
    assert overridden["periodic_service"]["km_interval"] == 7777
    assert overridden["periodic_service"]["km_interval"] != default["periodic_service"]["km_interval"]


# ═══════════════════════════════════════════════════════════════════════════
# calculate_maintenance_status — anti-drift, statuts
# ═══════════════════════════════════════════════════════════════════════════

def test_anti_drift_rounds_to_nearest_km_interval_multiple():
    """Exemple documenté dans CLAUDE.md : 10 500 + 10 000 doit donner 20 000, pas 20 500."""
    status, km_remaining, days_remaining, next_due_mileage, _ = calculator.calculate_maintenance_status(
        last_maintenance_date=None,
        last_maintenance_mileage=10500,
        current_mileage=15000,
        km_interval=10000,
        months_interval=None,
    )
    assert next_due_mileage == 20000


def test_anti_drift_does_not_accumulate_across_cycles():
    """Deux entretiens faits en retard d'affilée ne doivent pas cumuler le décalage."""
    _, _, _, next_due_1, _ = calculator.calculate_maintenance_status(
        None, 10800, 15000, 10000, None,
    )
    assert next_due_1 == 20000

    _, _, _, next_due_2, _ = calculator.calculate_maintenance_status(
        None, next_due_1 + 700, 25000, 10000, None,
    )
    assert next_due_2 == 30000


def test_status_overdue_when_km_remaining_negative():
    status, km_remaining, _, _, _ = calculator.calculate_maintenance_status(
        None, 10000, 21000, 10000, None,
    )
    assert status == "overdue"
    assert km_remaining < 0


def test_status_urgent_within_300km():
    status, km_remaining, _, _, _ = calculator.calculate_maintenance_status(
        None, 10000, 19750, 10000, None,
    )
    assert status == "urgent"
    assert km_remaining <= 300


def test_status_warning_within_1500km():
    status, km_remaining, _, _, _ = calculator.calculate_maintenance_status(
        None, 10000, 18800, 10000, None,
    )
    assert status == "warning"
    assert 300 < km_remaining <= 1500


def test_status_ok_when_far_from_due():
    status, _, _, _, _ = calculator.calculate_maintenance_status(
        None, 10000, 12000, 10000, None,
    )
    assert status == "ok"


def test_condition_based_always_ok():
    """Un entretien condition_based (ex: usure visuelle) n'a pas d'échéance calculée."""
    status, km_remaining, days_remaining, next_due_mileage, next_due_date = calculator.calculate_maintenance_status(
        None, None, 10000, None, None, condition_based=True,
    )
    assert status == "ok"
    assert next_due_mileage is None
    assert next_due_date is None


# ═══════════════════════════════════════════════════════════════════════════
# calculate_inspection_technical_date — réglementation française
# ═══════════════════════════════════════════════════════════════════════════

def test_car_first_inspection_4_years_plus_6_months():
    reg_date = datetime(2020, 3, 15)
    due = calculator.calculate_inspection_technical_date("car", reg_date, None)
    assert due == datetime(2024, 9, 15)


def test_car_subsequent_inspection_every_2_years():
    last = datetime(2024, 9, 15)
    due = calculator.calculate_inspection_technical_date("car", datetime(2020, 3, 15), last)
    assert due == datetime(2026, 9, 15)


def test_motorcycle_2022_plus_first_inspection_at_5th_anniversary():
    reg_date = datetime(2023, 6, 1)
    due = calculator.calculate_inspection_technical_date("motorcycle", reg_date, None)
    assert due == datetime(2028, 6, 1)


def test_motorcycle_2020_2021_cohort_special_rule():
    """Cohorte 2020-2021 : 5e anniversaire + 4 mois, plafonné au 31/12/2026."""
    reg_date = datetime(2020, 1, 1)
    due = calculator.calculate_inspection_technical_date("motorcycle", reg_date, None)
    assert due <= datetime(2026, 12, 31)


def test_no_registration_date_returns_none():
    assert calculator.calculate_inspection_technical_date("car", None, None) is None


# ═══════════════════════════════════════════════════════════════════════════
# get_all_upcoming_maintenances — filtrage motorisation, overrides
# ═══════════════════════════════════════════════════════════════════════════

def test_motorization_filter_excludes_non_matching_fuel_type():
    """Une voiture essence ne doit pas voir apparaître le filtre à gasoil."""
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=5000,
        last_maintenances={},
        vehicle_year=2020,
        motorization="essence",
    )
    keys = {item["intervention_key"] for item in upcoming}
    assert "fuel_filter_diesel" not in keys
    assert "fuel_filter_gasoline" in keys


def test_motorization_filter_excludes_non_matching_diesel():
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=5000,
        last_maintenances={},
        vehicle_year=2020,
        motorization="diesel",
    )
    keys = {item["intervention_key"] for item in upcoming}
    assert "fuel_filter_gasoline" not in keys
    assert "fuel_filter_diesel" in keys


def test_never_recorded_flag_true_without_history():
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=5000,
        last_maintenances={},
        vehicle_year=2020,
    )
    oil_change = next(item for item in upcoming if item["intervention_key"] == "oil_change")
    assert oil_change["never_recorded"] is True


def test_never_recorded_flag_false_with_history():
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=15000,
        last_maintenances={"oil_change": (datetime(2024, 1, 1), 5000)},
        vehicle_year=2020,
    )
    oil_change = next(item for item in upcoming if item["intervention_key"] == "oil_change")
    assert oil_change["never_recorded"] is False


def test_override_km_interval_takes_precedence_over_json():
    class FakeOverride:
        is_km_disabled = False
        km_interval = 15000
        is_months_disabled = False
        months_interval = None

    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=5000,
        last_maintenances={},
        vehicle_year=2020,
        overrides={"oil_change": FakeOverride()},
    )
    oil_change = next(item for item in upcoming if item["intervention_key"] == "oil_change")
    assert oil_change["km_interval"] == 15000
    assert oil_change["has_override"] is True


def test_override_disabled_km_criterion_sets_interval_none():
    class FakeOverride:
        is_km_disabled = True
        km_interval = None
        is_months_disabled = False
        months_interval = None

    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="car",
        current_mileage=5000,
        last_maintenances={},
        vehicle_year=2020,
        overrides={"oil_change": FakeOverride()},
    )
    oil_change = next(item for item in upcoming if item["intervention_key"] == "oil_change")
    assert oil_change["km_interval"] is None


def test_annual_service_reference_date_uses_most_recent_major_service():
    """La date de référence de l'entretien annuel = la plus récente des interventions majeures."""
    upcoming = calculator.get_all_upcoming_maintenances(
        vehicle_type="motorcycle",
        current_mileage=25000,
        last_maintenances={
            "annual_service": (datetime(2023, 1, 1), None),
            "periodic_service": (datetime(2024, 6, 1), 20000),
        },
        vehicle_year=2020,
        registration_date=datetime(2020, 1, 1),
        service_interval_km=10000,
    )
    annual = next(item for item in upcoming if item["intervention_key"] == "annual_service")
    # Référence = 2024-06-01 (periodic_service, plus récent que annual_service lui-même)
    assert annual["next_due_date"].startswith("2025-06-01")


# ═══════════════════════════════════════════════════════════════════════════
# get_intervention_key / build_last_maintenances_dict
# ═══════════════════════════════════════════════════════════════════════════

def test_get_intervention_key_known_translation():
    assert get_intervention_key("Vidange d'huile + Remplacement filtre à huile") == "oil_change_moto"


def test_get_intervention_key_unknown_name_falls_back_to_slug():
    assert get_intervention_key("Un nom jamais vu auparavant") == "un_nom_jamais_vu_auparavant"


def test_build_last_maintenances_dict_keeps_most_recent_per_key():
    class FakeMaintenance:
        def __init__(self, intervention_type, execution_date, mileage):
            self.intervention_type = intervention_type
            self.execution_date = execution_date
            self.mileage_at_intervention = mileage
            self.sub_interventions = None

    maintenances = [
        FakeMaintenance("Vidange d'huile", datetime(2023, 1, 1), 5000),
        FakeMaintenance("Vidange d'huile", datetime(2024, 1, 1), 15000),
    ]
    result = build_last_maintenances_dict(maintenances)
    assert result["oil_change"] == (datetime(2024, 1, 1), 15000)
