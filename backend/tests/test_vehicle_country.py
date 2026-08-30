"""
Pays d'immatriculation du véhicule.

Pourquoi la colonne est sur le VÉHICULE et pas sur l'utilisateur
────────────────────────────────────────────────────────────────
Le calendrier du contrôle technique s'en déduit. Par utilisateur, un membre du
groupe famille verrait une échéance **différente de celle du propriétaire, sur
le même véhicule** — or la date de CT est un fait sur la machine, pas un goût
de qui la regarde. C'est la propriété que ces tests protègent.

Le second point tenu ici : `NULL` veut dire « suit le pays de l'instance ».
Écrire le pays de l'instance en dur à la création figerait le véhicule sur le
pays du jour, et un changement d'instance ne le suivrait plus.
"""

from tests.test_families import (
    auth_headers,
    make_vehicle,
    open_registration,
    register,
    token_of,
)


def headers_of(client, username="alice"):
    register(client, username)
    return auth_headers(token_of(client, username))


def test_a_new_vehicle_follows_the_instance_by_default(client, open_registration):
    headers = headers_of(client)

    vehicle = make_vehicle(client, headers)

    # NULL, et non « FR » recopié : le véhicule suivra l'instance si elle change.
    assert vehicle["country"] is None


def test_a_vehicle_can_name_its_own_country(client, open_registration):
    headers = headers_of(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    res = client.put(f"/api/vehicles/{vehicle_id}", json={"country": "fr"}, headers=headers)
    assert res.status_code == 200, res.text

    after = client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()
    assert after["country"] == "FR"  # normalisé en majuscules


def test_clearing_the_country_puts_the_vehicle_back_under_the_instance(client, open_registration):
    """La chaîne vide est le seul moyen de revenir au défaut : `null` dans le
    corps signifie « champ absent », donc « ne touche pas »."""
    headers = headers_of(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    client.put(f"/api/vehicles/{vehicle_id}", json={"country": "FR"}, headers=headers)
    client.put(f"/api/vehicles/{vehicle_id}", json={"country": ""}, headers=headers)

    assert client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()["country"] is None


def test_a_field_absent_from_the_body_leaves_the_country_alone(client, open_registration):
    headers = headers_of(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    client.put(f"/api/vehicles/{vehicle_id}", json={"country": "FR"}, headers=headers)

    client.put(f"/api/vehicles/{vehicle_id}", json={"name": "Renommé"}, headers=headers)

    assert client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()["country"] == "FR"


def test_the_inspection_date_is_computed_with_the_vehicle_country(client, open_registration):
    """Le point qui compte : le pays du véhicule atteint réellement le calcul
    du contrôle technique, et pas seulement la colonne en base."""
    from maintenance_calculator import calculator

    from datetime import datetime

    registration = datetime(2022, 6, 1)

    # La règle française : 5ᵉ anniversaire pour une moto immatriculée en 2022+.
    fr = calculator.calculate_inspection_technical_date("motorcycle", registration, None, "FR")
    assert fr == datetime(2027, 6, 1)

    # Un code inconnu retombe sur la France plutôt que de renvoyer None : une
    # image redescendue qui ne connaît plus un pays doit continuer de calculer.
    unknown = calculator.calculate_inspection_technical_date("motorcycle", registration, None, "ZZ")
    assert unknown == fr


# ── Un code inconnu est refusé, jamais absorbé ─────────────────────────────

def test_an_unknown_country_is_refused_rather_than_silently_ignored(client, open_registration):
    """`get_region()` retombe sur la France pour un code inconnu, et c'est le
    bon comportement au démarrage — l'alternative serait un backend mort. Mais
    accepté ici, le véhicule se verrait appliquer le calendrier de contrôle
    technique français sans que rien ne l'indique. Même raisonnement que pour
    `PUT /admin/region` (§20.3) : le pays décide d'une échéance réglementaire.
    """
    headers = headers_of(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    res = client.put(f"/api/vehicles/{vehicle_id}", json={"country": "ZZ"}, headers=headers)

    assert res.status_code == 400, res.text
    # Le message nomme les pays connus : un refus muet laisserait chercher.
    assert "FR" in res.json()["detail"]
    assert client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()["country"] is None


def test_an_unknown_country_is_refused_at_creation_too(client, open_registration):
    headers = headers_of(client)

    res = client.post(
        "/api/vehicles",
        json={
            "name": "Ailleurs",
            "vehicle_type": "motorcycle",
            "brand": "Yamaha",
            "model": "MT-07",
            "year": 2022,
            "motorization": "essence",
            "displacement": 689,
            "current_mileage": 10000,
            "country": "ZZ",
        },
        headers=headers,
    )

    assert res.status_code == 400, res.text
    assert "FR" in res.json()["detail"]
