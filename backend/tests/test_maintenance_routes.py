"""
Tests des routes d'enregistrement d'entretien, côté clé technique.

Ces tests verrouillent le contrat qui rend l'internationalisation possible :
c'est `intervention_key` qui identifie une intervention en base, pas le libellé
français affiché. Tant que la base ne stockait que le libellé, le renommer
détachait la ligne de son historique et faisait disparaître l'échéance
correspondante de « À venir », sans erreur ni trace.
"""

import pytest


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


def _record(client, headers, vehicle_id, intervention_type, **extra):
    payload = {
        "intervention_type": intervention_type,
        "execution_date": "2026-01-15T10:00:00",
        "mileage_at_intervention": 20500,
        "maintenance_category": "scheduled",
    }
    payload.update(extra)
    return client.post(
        f"/api/vehicles/{vehicle_id}/maintenances", headers=headers, json=payload
    )


def test_recording_a_maintenance_stores_its_technical_key(client, headers, vehicle_id):
    res = _record(client, headers, vehicle_id, "Contrôle jeu aux soupapes")
    assert res.status_code in (200, 201), res.text
    assert res.json()["intervention_key"] == "valve_clearance"


def test_two_labels_of_the_same_intervention_share_one_key(client, headers, vehicle_id):
    """« Purge liquide de frein et embrayage » est l'ancien nom de
    « Remplacement liquide de frein ». Les deux doivent tomber sur brake_fluid,
    sinon l'historique se scinde en deux échéances distinctes."""
    old = _record(client, headers, vehicle_id, "Purge liquide de frein et embrayage")
    new = _record(client, headers, vehicle_id, "Remplacement liquide de frein")

    assert old.json()["intervention_key"] == new.json()["intervention_key"] == "brake_fluid"


def test_unknown_label_still_records_and_gets_a_slug_key(client, headers, vehicle_id):
    """Un libellé hors dictionnaire ne doit jamais faire échouer
    l'enregistrement : perdre la saisie de l'utilisateur serait pire que de
    ranger l'intervention sous une clé approximative."""
    res = _record(client, headers, vehicle_id, "Un entretien jamais vu")
    assert res.status_code in (200, 201), res.text
    assert res.json()["intervention_key"] == "un_entretien_jamais_vu"


def test_recorded_maintenance_is_matched_to_its_upcoming_item(client, headers, vehicle_id):
    """Preuve de bout en bout : l'entretien enregistré ressort bien rattaché à
    son échéance, et non « jamais enregistré »."""
    _record(client, headers, vehicle_id, "Contrôle jeu aux soupapes")

    res = client.get(f"/api/vehicles/{vehicle_id}/upcoming", headers=headers)
    assert res.status_code == 200
    valve = next(
        item for item in res.json()["upcoming"]
        if item["intervention_key"] == "valve_clearance"
    )
    assert valve["never_recorded"] is False


# ── Qui a fait le travail ─────────────────────────────────────────────────


def test_a_maintenance_records_who_performed_it(client, headers, vehicle_id):
    res = _record(client, headers, vehicle_id, "Révision fourche", performed_by="pro")
    assert res.status_code in (200, 201), res.text
    assert res.json()["performed_by"] == "pro"

    listed = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    assert listed[0]["performed_by"] == "pro"


def test_who_performed_it_is_optional_and_defaults_to_unknown(client, headers, vehicle_id):
    """« Je ne sais plus » est une réponse honnête sur une facture de 2019 :
    le champ ne se force pas, et vide veut dire vide — pas « soi-même »."""
    res = _record(client, headers, vehicle_id, "Révision fourche")
    assert res.json()["performed_by"] is None

    res = _record(client, headers, vehicle_id, "Révision fourche", performed_by="")
    assert res.json()["performed_by"] is None


def test_an_unknown_performer_value_is_refused(client, headers, vehicle_id):
    """Deux valeurs, pas de texte libre : le carnet imprime cette case dans
    une colonne de 18 mm, et un acheteur doit pouvoir la comparer d'une ligne
    à l'autre."""
    res = _record(client, headers, vehicle_id, "Révision fourche", performed_by="mon cousin")
    assert res.status_code == 400


def test_who_performed_it_can_be_changed_or_cleared_afterwards(client, headers, vehicle_id):
    created = _record(client, headers, vehicle_id, "Révision fourche", performed_by="self").json()
    url = f"/api/vehicles/{vehicle_id}/maintenances/{created['id']}"

    # Un PUT qui ne parle pas du champ ne le touche pas.
    res = client.put(url, headers=headers, json={"notes": "rien à voir"})
    assert res.json()["performed_by"] == "self"

    res = client.put(url, headers=headers, json={"performed_by": "pro"})
    assert res.json()["performed_by"] == "pro"

    # Vide = revenir à « non renseigné ».
    res = client.put(url, headers=headers, json={"performed_by": ""})
    assert res.json()["performed_by"] is None


def test_who_performed_it_travels_through_the_multipart_form_too(client, headers, vehicle_id):
    """Le formulaire de l'interface envoie du multipart (factures jointes) :
    le champ doit passer par ce chemin comme par le JSON."""
    res = client.post(
        f"/api/vehicles/{vehicle_id}/maintenances", headers=headers,
        data={
            "intervention_type": "Révision fourche",
            "execution_date": "2026-01-15T10:00:00",
            "mileage_at_intervention": "20500",
            "performed_by": "pro",
        },
        files={"invoice_files": ("", b"")},
    )
    assert res.status_code in (200, 201), res.text
    assert res.json()["performed_by"] == "pro"


def test_two_maintenances_on_the_same_day_list_the_latest_recorded_first(client, headers, vehicle_id):
    """Sans second critère de tri, SQLite rend un même jour dans l'ordre
    d'insertion : la dernière saisie passait sous la précédente, et la liste
    paraissait non triée."""
    first = _record(client, headers, vehicle_id, "Contrôle jeu aux soupapes").json()
    second = _record(client, headers, vehicle_id, "Synchronisation injection").json()

    listed = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    assert [m["id"] for m in listed[:2]] == [second["id"], first["id"]]
