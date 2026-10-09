"""
Contre-visite du contrôle technique (migration 018).

Un CT défavorable laisse deux mois, en France, pour passer la contre-visite.
Avant cette colonne, l'enregistrer repoussait l'échéance de deux ans : le
véhicule paraissait en règle alors qu'il lui restait quelques semaines.

Les dates sont relatives à aujourd'hui : le calculateur compte les jours
restants depuis `utcnow()`.
"""

from datetime import datetime, timedelta

import pytest
from dateutil.relativedelta import relativedelta

from maintenance_calculator import (
    COUNTER_VISIT_PENDING_KEY,
    build_last_maintenances_dict,
    calculator,
)
from tests.test_maintenance_routes import _account


CT = "Contrôle technique"
COUNTER_VISIT = "Contre-visite (contrôle technique)"


@pytest.fixture()
def headers(client):
    return _account(client)


@pytest.fixture()
def car_id(client, headers):
    res = client.post("/api/vehicles", headers=headers, json={
        "name": "La familiale", "brand": "Peugeot", "model": "308",
        "year": 2015, "vehicle_type": "car", "motorization": "diesel",
        "current_mileage": 120000, "registration_date": "2015-03-01",
    })
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


def _record(client, headers, vehicle_id, intervention_type, when, **extra):
    payload = {
        "intervention_type": intervention_type,
        "execution_date": when.isoformat(),
        "mileage_at_intervention": 120000,
        "maintenance_category": "scheduled",
    }
    payload.update(extra)
    res = client.post(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers, json=payload)
    assert res.status_code in (200, 201), res.text
    return res.json()


def _ct_item(client, headers, vehicle_id):
    upcoming = client.get(f"/api/vehicles/{vehicle_id}/upcoming", headers=headers).json()["upcoming"]
    return next(u for u in upcoming if u["intervention_key"].startswith("inspection_technical"))


def _day(iso):
    return datetime.fromisoformat(iso).date()


def test_a_failed_inspection_gives_two_months_for_the_counter_visit(client, headers, car_id):
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=10)
    saved = _record(client, headers, car_id, CT, ct_date, counter_visit_required=True)
    assert saved["counter_visit_required"] is True

    item = _ct_item(client, headers, car_id)
    assert item["counter_visit_pending"] is True
    assert item["intervention_type"] == COUNTER_VISIT
    assert _day(item["next_due_date"]) == (ct_date + relativedelta(months=2)).date()
    assert item["status"] == "warning"


def test_a_passed_inspection_keeps_the_regular_calendar(client, headers, car_id):
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=10)
    saved = _record(client, headers, car_id, CT, ct_date)
    assert saved["counter_visit_required"] is False

    item = _ct_item(client, headers, car_id)
    assert not item.get("counter_visit_pending")
    assert _day(item["next_due_date"]) == (ct_date + relativedelta(years=2)).date()


def test_the_counter_visit_does_not_move_the_next_inspection(client, headers, car_id):
    """Le prochain CT se compte depuis la visite INITIALE, pas depuis la
    contre-visite : repasser trois semaines plus tard n'achète pas trois
    semaines de validité en plus."""
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=40)
    _record(client, headers, car_id, CT, ct_date, counter_visit_required=True)
    _record(client, headers, car_id, COUNTER_VISIT, ct_date + timedelta(days=21))

    item = _ct_item(client, headers, car_id)
    assert not item.get("counter_visit_pending")
    assert _day(item["next_due_date"]) == (ct_date + relativedelta(years=2)).date()


def test_an_overdue_counter_visit_is_overdue(client, headers, car_id):
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=75)
    _record(client, headers, car_id, CT, ct_date, counter_visit_required=True)

    item = _ct_item(client, headers, car_id)
    assert item["counter_visit_pending"] is True
    assert item["status"] == "overdue"


def test_a_counter_visit_older_than_the_last_inspection_does_not_settle_it(client, headers, car_id):
    """La contre-visite d'un CT d'il y a deux ans ne solde pas celui d'hier."""
    now = datetime.utcnow().replace(microsecond=0)
    _record(client, headers, car_id, COUNTER_VISIT, now - timedelta(days=700))
    _record(client, headers, car_id, CT, now - timedelta(days=5), counter_visit_required=True)

    assert _ct_item(client, headers, car_id)["counter_visit_pending"] is True


def test_the_flag_is_ignored_outside_an_inspection(client, headers, car_id):
    saved = _record(
        client, headers, car_id, "Vidange d'huile + Remplacement filtre à huile",
        datetime.utcnow() - timedelta(days=3), counter_visit_required=True,
    )
    assert saved["counter_visit_required"] is False


def test_the_flag_can_be_cleared_afterwards(client, headers, car_id):
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=10)
    saved = _record(client, headers, car_id, CT, ct_date, counter_visit_required=True)

    res = client.put(
        f"/api/vehicles/{car_id}/maintenances/{saved['id']}", headers=headers,
        json={"counter_visit_required": False},
    )
    assert res.status_code == 200, res.text
    assert not _ct_item(client, headers, car_id).get("counter_visit_pending")


def test_the_flag_travels_in_multipart(client, headers, car_id):
    """Le formulaire envoie du multipart : la case y arrive en texte."""
    ct_date = datetime.utcnow().replace(microsecond=0) - timedelta(days=10)
    res = client.post(
        f"/api/vehicles/{car_id}/maintenances", headers=headers,
        data={
            "intervention_type": CT,
            "execution_date": ct_date.isoformat(),
            "mileage_at_intervention": "120000",
            "counter_visit_required": "true",
        },
        files={"invoice_files": ("", b"", "application/octet-stream")},
    )
    assert res.status_code in (200, 201), res.text
    assert res.json()["counter_visit_required"] is True


def test_the_counter_visit_is_recordable(client, headers, car_id):
    """Sans elle dans la liste, la contre-visite ne pourrait jamais être
    enregistrée et l'échéance resterait ouverte pour toujours."""
    for vehicle_type in ("car", "motorcycle"):
        res = client.get(
            f"/api/vehicles/{car_id}/available-interventions",
            params={"vehicle_type": vehicle_type, "displacement": 689}, headers=headers,
        )
        assert res.status_code == 200, res.text
        assert COUNTER_VISIT in res.text, vehicle_type


# ── Règle pure ──────────────────────────────────────────────────────────────

class _M:
    def __init__(self, key, when, counter_visit_required=None):
        self.intervention_key = key
        self.intervention_type = None
        self.execution_date = when
        self.mileage_at_intervention = 0
        self.sub_interventions = None
        self.counter_visit_required = counter_visit_required


def test_without_a_country_rule_the_counter_visit_is_ignored(monkeypatch):
    """Un pays qui ne connaît pas la contre-visite garde son calendrier."""
    ct_date = datetime.utcnow() - timedelta(days=10)
    last = build_last_maintenances_dict([_M("inspection_technical_car", ct_date, True)])
    assert COUNTER_VISIT_PENDING_KEY in last

    monkeypatch.setattr(calculator, "_counter_visit_months", lambda region_code: None)
    upcoming = calculator.get_all_upcoming_maintenances(
        "car", 120000, last, registration_date=datetime(2015, 3, 1),
    )
    item = next(u for u in upcoming if u["intervention_key"] == "inspection_technical_car")
    assert not item.get("counter_visit_pending")
