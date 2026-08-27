"""
Tests des deux réponses au ticket #4 : écarter un entretien qui ne concerne pas
le véhicule, et en ajouter un qui n'est pas au catalogue.

Les deux passent par `vehicle_maintenance_overrides`. C'est ce qui garantit que
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


# ═══════════════════════════════════════════════════════════════════════════
# Ajouter un entretien personnalisé
# ═══════════════════════════════════════════════════════════════════════════

def _create_custom(client, headers, vehicle_id, **body):
    payload = {"name": "Vérification plaquettes", "km_interval": 500}
    payload.update(body)
    return client.post(
        f"/api/vehicles/{vehicle_id}/custom-maintenances", headers=headers, json=payload
    )


def test_a_custom_maintenance_shows_up_in_the_deadlines(client, headers, vehicle_id):
    res = _create_custom(client, headers, vehicle_id)
    assert res.status_code == 201, res.text
    key = res.json()["intervention_key"]
    assert key.startswith("custom_")

    item = next(
        i for i in _upcoming(client, headers, vehicle_id)["upcoming"]
        if i["intervention_key"] == key
    )
    assert item["intervention_type"] == "Vérification plaquettes"
    assert item["km_interval"] == 500
    assert item["is_custom"] is True
    assert item["never_recorded"] is True


def test_a_custom_maintenance_can_be_recorded_and_closes_its_deadline(client, headers, vehicle_id):
    """Sans cela, un entretien personnalisé resterait éternellement en retard :
    il ne pourrait jamais être marqué comme fait."""
    key = _create_custom(client, headers, vehicle_id).json()["intervention_key"]

    available = client.get(
        f"/api/vehicles/{vehicle_id}/available-interventions",
        headers=headers, params={"vehicle_type": "motorcycle", "displacement": 689},
    ).json()["interventions"]
    assert any(i["id"] == key and i["is_custom"] for i in available)

    recorded = client.post(
        f"/api/vehicles/{vehicle_id}/maintenances", headers=headers, json={
            "intervention_type": "Vérification plaquettes",
            "execution_date": "2026-01-15T10:00:00",
            "mileage_at_intervention": 20000,
            "maintenance_category": "scheduled",
        },
    )
    assert recorded.status_code in (200, 201), recorded.text
    assert recorded.json()["intervention_key"] == key

    item = next(
        i for i in _upcoming(client, headers, vehicle_id)["upcoming"]
        if i["intervention_key"] == key
    )
    assert item["never_recorded"] is False
    assert item["next_due_mileage"] == 20500


def test_a_custom_maintenance_needs_at_least_one_interval(client, headers, vehicle_id):
    res = _create_custom(client, headers, vehicle_id, km_interval=None, months_interval=None)
    assert res.status_code == 422


def test_two_maintenances_cannot_share_a_name(client, headers, vehicle_id):
    """Deux libellés identiques rendraient arbitraire le rattachement d'un
    entretien enregistré à l'une ou l'autre échéance."""
    assert _create_custom(client, headers, vehicle_id).status_code == 201
    assert _create_custom(client, headers, vehicle_id).status_code == 409
    assert _create_custom(
        client, headers, vehicle_id, name="  vérification PLAQUETTES  "
    ).status_code == 409
    assert _create_custom(
        client, headers, vehicle_id, name="Entretien annuel"
    ).status_code == 409


def test_a_custom_maintenance_can_be_renamed_and_retimed(client, headers, vehicle_id):
    key = _create_custom(client, headers, vehicle_id).json()["intervention_key"]
    res = client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/{key}", headers=headers,
        json={
            "name": "Contrôle plaquettes", "km_interval": 1000,
            "is_months_disabled": True,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["custom_name"] == "Contrôle plaquettes"

    item = next(
        i for i in _upcoming(client, headers, vehicle_id)["upcoming"]
        if i["intervention_key"] == key
    )
    assert item["intervention_type"] == "Contrôle plaquettes"
    assert item["km_interval"] == 1000


def test_renaming_a_catalog_intervention_is_ignored(client, headers, vehicle_id):
    """Le libellé d'une intervention du catalogue vient du JSON. L'autoriser à
    diverger par véhicule ferait afficher deux noms pour une même clé."""
    res = client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/coolant", headers=headers,
        json={"name": "Mon nom à moi", "km_interval": 30000},
    )
    assert res.status_code == 200, res.text
    assert res.json()["custom_name"] is None

    item = next(
        i for i in _upcoming(client, headers, vehicle_id)["upcoming"]
        if i["intervention_key"] == "coolant"
    )
    assert item["intervention_type"] != "Mon nom à moi"


def test_deleting_a_custom_maintenance_removes_its_deadline(client, headers, vehicle_id):
    key = _create_custom(client, headers, vehicle_id).json()["intervention_key"]
    res = client.delete(
        f"/api/vehicles/{vehicle_id}/interval-overrides/{key}", headers=headers
    )
    assert res.status_code == 200, res.text
    assert key not in _keys(_upcoming(client, headers, vehicle_id))


def test_an_unknown_custom_key_is_not_resurrected_by_an_update(client, headers, vehicle_id):
    """Un PUT crée la surcharge d'une intervention du catalogue, mais ne doit
    pas recréer un entretien personnalisé supprimé : la clé ne désignerait plus
    rien, et l'entrée n'aurait pas de libellé."""
    res = client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/custom_deadbeef",
        headers=headers, json={"km_interval": 1000},
    )
    assert res.status_code == 404


def test_a_custom_maintenance_belongs_to_its_vehicle_only(client, headers, vehicle_id):
    key = _create_custom(client, headers, vehicle_id).json()["intervention_key"]
    other = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma voiture", "brand": "Peugeot", "model": "208",
        "year": 2019, "vehicle_type": "car", "motorization": "essence",
        "current_mileage": 60000,
    }).json()["id"]

    assert key not in _keys(_upcoming(client, headers, other))


def test_writing_a_custom_maintenance_needs_ownership(client, headers, vehicle_id):
    intruder = _account(client, username="intrus")
    res = _create_custom(client, intruder, vehicle_id)
    assert res.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# Contrôle technique : périodicité fixée à la main
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def dated_vehicle_id(client, headers):
    """Une moto avec sa date de mise en circulation.

    Le calendrier réglementaire du CT part de la MEC : sans elle il ne produit
    aucune date, et le test ne comparerait que des `None`.
    """
    res = client.post("/api/vehicles", headers=headers, json={
        "name": "Ma moto datée", "brand": "Yamaha", "model": "MT-07",
        "year": 2021, "vehicle_type": "motorcycle", "displacement": 689,
        "motorization": "essence", "current_mileage": 20000,
        "registration_date": "2021-06-15T00:00:00",
    })
    assert res.status_code in (200, 201), res.text
    return res.json()["id"]


def _inspection(client, headers, vehicle_id):
    return next(
        i for i in _upcoming(client, headers, vehicle_id)["upcoming"]
        if i["intervention_key"].startswith("inspection_technical")
    )


def test_the_inspection_follows_the_legal_calendar_by_default(client, headers, dated_vehicle_id):
    item = _inspection(client, headers, dated_vehicle_id)
    assert item["has_override"] is False
    assert item["km_interval"] is None  # jamais de critère kilométrique
    assert item["next_due_date"]


def test_the_inspection_periodicity_can_be_set_by_hand(client, headers, dated_vehicle_id):
    """Un véhicule de collection, ou immatriculé ailleurs, ne suit pas le
    calendrier français. La surcharge le remplace ; sans elle rien ne change."""
    legal_due = _inspection(client, headers, dated_vehicle_id)["next_due_date"]

    res = client.put(
        f"/api/vehicles/{dated_vehicle_id}/interval-overrides/inspection_technical_moto",
        headers=headers,
        json={"months_interval": 24, "is_km_disabled": True},
    )
    assert res.status_code == 200, res.text

    item = _inspection(client, headers, dated_vehicle_id)
    assert item["months_interval"] == 24
    assert item["km_interval"] is None
    assert item["has_override"] is True
    assert item["next_due_date"] != legal_due


def test_the_inspection_returns_to_the_legal_calendar_when_reset(client, headers, dated_vehicle_id):
    legal_due = _inspection(client, headers, dated_vehicle_id)["next_due_date"]
    client.put(
        f"/api/vehicles/{dated_vehicle_id}/interval-overrides/inspection_technical_moto",
        headers=headers, json={"months_interval": 24, "is_km_disabled": True},
    )
    client.delete(
        f"/api/vehicles/{dated_vehicle_id}/interval-overrides/inspection_technical_moto",
        headers=headers,
    )
    item = _inspection(client, headers, dated_vehicle_id)
    assert item["has_override"] is False
    assert item["next_due_date"] == legal_due


def test_a_hand_set_inspection_counts_from_the_last_recorded_one(client, headers, vehicle_id):
    client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/inspection_technical_moto",
        headers=headers, json={"months_interval": 24, "is_km_disabled": True},
    )
    client.post(
        f"/api/vehicles/{vehicle_id}/maintenances", headers=headers, json={
            "intervention_type": "Contrôle technique",
            "execution_date": "2026-01-15T10:00:00",
            "mileage_at_intervention": 20000,
            "maintenance_category": "scheduled",
        },
    )
    item = _inspection(client, headers, vehicle_id)
    assert item["never_recorded"] is False
    assert item["next_due_date"].startswith("2028-01-15")


def test_the_inspection_can_be_set_aside_like_any_other(client, headers, vehicle_id):
    client.put(
        f"/api/vehicles/{vehicle_id}/interval-overrides/inspection_technical_moto",
        headers=headers, json={"is_disabled": True},
    )
    payload = _upcoming(client, headers, vehicle_id)
    assert all(not k.startswith("inspection_technical") for k in _keys(payload))
    assert [d["intervention_key"] for d in payload["disabled"]] == ["inspection_technical_moto"]
