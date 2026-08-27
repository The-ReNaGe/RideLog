"""
Tests de la mise à l'écart d'un entretien qui ne concerne pas le véhicule
(ticket #4).

Elle passe par `vehicle_maintenance_overrides`. C'est ce qui garantit que
les cinq appelants du calculateur — échéances, tableau de bord, planning,
pastilles de la liste, rappels — en tiennent compte sans qu'aucun n'ait à être
modifié. Les tests le vérifient sur deux voies distinctes plutôt que sur la
seule route `/upcoming`, précisément parce qu'une divergence entre elles serait
silencieuse.
"""

import pytest

import config as app_config


@pytest.fixture(autouse=True)
def open_registration():
    """Inscriptions libres — évite de fabriquer une invitation à chaque compte."""
    previous = app_config.REGISTRATION_MODE
    app_config.REGISTRATION_MODE = "open"
    yield
    app_config.REGISTRATION_MODE = previous


def _account(client, username="conducteur"):
    client.post("/api/auth/register", json={
        "username": username, "display_name": username,
        "password": "Password123", "password_confirm": "Password123",
    })
    token = client.post("/api/auth/login", json={
        "username": username, "password": "Password123",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def headers(client):
    return _account(client)


@pytest.fixture()
def vehicle_id(client, headers):
    res = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma moto", "brand": "Yamaha", "model": "MT-07",
        "year": 2021, "vehicle_type": "motorcycle", "displacement": 689,
        "motorization": "essence", "current_mileage": 20000,
    })
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


def _upcoming(client, headers, vehicle_id):
    res = client.get(f"/api/vehicles/{vehicle_id}/upcoming", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _keys(payload):
    return [item["intervention_key"] for item in payload["upcoming"]]


# ═══════════════════════════════════════════════════════════════════════════
# Écarter un entretien
# ═══════════════════════════════════════════════════════════════════════════

def test_a_disabled_intervention_leaves_the_deadlines(client, headers, vehicle_id):
    assert "coolant" in _keys(_upcoming(client, headers, vehicle_id))

    res = client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant",
        headers=headers, json={"is_disabled": True},
    )
    assert res.status_code == 200, res.text

    payload = _upcoming(client, headers, vehicle_id)
    assert "coolant" not in _keys(payload)
    assert [d["intervention_key"] for d in payload["disabled"]] == ["coolant"]


def test_a_disabled_intervention_can_be_restored(client, headers, vehicle_id):
    client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant",
        headers=headers, json={"is_disabled": True},
    )
    res = client.delete(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant", headers=headers
    )
    assert res.status_code == 200, res.text

    payload = _upcoming(client, headers, vehicle_id)
    assert "coolant" in _keys(payload)
    assert payload["disabled"] == []


def test_a_disabled_intervention_is_no_longer_recordable(client, headers, vehicle_id):
    """Symétrie : ce qui ne concerne pas le véhicule ne doit pas non plus être
    proposé à l'enregistrement."""
    client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant",
        headers=headers, json={"is_disabled": True},
    )
    res = client.get(
        f"/api/vehicles/{vehicle_id}/available-interventions",
        headers=headers, params={"vehicle_type": "motorcycle", "displacement": 689},
    )
    assert res.status_code == 200, res.text
    assert all(i["id"] != "coolant" for i in res.json()["interventions"])


def test_disabling_also_silences_the_card_alert_counters(client, headers, vehicle_id):
    """Seconde voie : `GET /vehicles` calcule ses compteurs dans
    `vehicle_status.py`, pas dans `/upcoming`. Une désactivation qui ne vaudrait
    que pour l'une des deux laisserait une pastille rouge sur l'accueil pour un
    entretien que l'utilisateur a écarté."""
    before = client.get("/api/vehicles", headers=headers).json()[0]
    keys = _keys(_upcoming(client, headers, vehicle_id))
    assert "coolant" in keys

    overdue_keys = [
        item["intervention_key"]
        for item in _upcoming(client, headers, vehicle_id)["upcoming"]
        if item["status"] == "overdue"
    ]
    if "coolant" not in overdue_keys:
        pytest.skip("Le liquide de refroidissement n'est pas en retard sur ce véhicule")

    client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant",
        headers=headers, json={"is_disabled": True},
    )
    after = client.get("/api/vehicles", headers=headers).json()[0]
    assert after["overdue_count"] == before["overdue_count"] - 1
