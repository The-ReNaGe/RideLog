"""
La devise d'un montant, et la conversion.

Ce que ces tests verrouillent, et pourquoi
──────────────────────────────────────────
Un montant stocké est un nombre nu. Seule la devise qui l'accompagne lui donne
un sens, et c'est tout l'objet de ce lot :

  - **un montant garde la devise dans laquelle il a été saisi.** Sans ce
    marquage, une révision payée 200 $ redevient « 200 € » au premier
    changement de réglage d'affichage, et plus rien ne dit laquelle des deux
    phrases est vraie. C'est une falsification silencieuse de l'historique ;
  - **changer la devise d'affichage ne recalcule rien**, et fige au passage la
    devise sortante sur ce qui n'était pas encore marqué — sans quoi tout
    l'historique antérieur au marquage suivrait le nouveau symbole ;
  - **la conversion est une commande séparée**, avec un taux fourni à la main,
    un aperçu, et une sauvegarde. Les deux intentions — « je m'étais trompé de
    symbole » et « j'ai déménagé » — ne doivent pas partager un menu déroulant ;
  - **un total qui enjambe deux devises est ventilé**, jamais additionné : la
    somme de 200 € et 200 $ n'est pas 400, et un chiffre faux dans une carte
    de tableau de bord ne se recompte jamais.
"""

from tests.test_families import (
    auth_headers,
    make_vehicle,
    open_registration,
    register,
    token_of,
)


def admin_headers(client):
    register(client, "alice")
    return auth_headers(token_of(client, "alice"))


def add_maintenance(client, headers, vehicle_id, cost, date="2024-03-01T00:00:00"):
    res = client.post(
        f"/api/vehicles/{vehicle_id}/maintenances",
        json={
            "intervention_type": "Vidange d'huile + Remplacement filtre à huile",
            "execution_date": date,
            "mileage_at_intervention": 10000,
            "cost_paid": cost,
        },
        headers=headers,
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


def switch_currency(client, headers, code):
    res = client.put("/api/admin/currency", json={"code": code}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ── Le marquage ────────────────────────────────────────────────────────────

def test_a_recorded_amount_carries_the_currency_of_the_moment(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    switch_currency(client, headers, "USD")
    recorded = add_maintenance(client, headers, vehicle_id, 200)

    assert recorded["currency"] == "USD"


def test_an_amount_keeps_its_currency_when_the_instance_changes(client, open_registration):
    """Le garde-fou central : « j'ai mis 200 $ dans la révision » reste vrai."""
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    switch_currency(client, headers, "USD")
    add_maintenance(client, headers, vehicle_id, 200)
    switch_currency(client, headers, "EUR")

    history = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    line = history[0] if isinstance(history, list) else history["maintenances"][0]
    assert line["cost_paid"] == 200
    assert line["currency"] == "USD"


def test_switching_the_currency_freezes_what_was_not_yet_marked(client, open_registration, db_session):
    """Une ligne sans marquage a été saisie dans la devise en vigueur jusque-là.

    L'écrire au dernier moment où on la connaît encore est la seule façon
    d'éviter qu'elle se mette à suivre le nouveau symbole.
    """
    from models import Maintenance

    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    recorded = add_maintenance(client, headers, vehicle_id, 150)

    # On simule une ligne antérieure au marquage.
    row = db_session.get(Maintenance, recorded["id"])
    row.currency = None
    db_session.commit()

    switch_currency(client, headers, "USD")

    db_session.expire_all()
    assert db_session.get(Maintenance, recorded["id"]).currency == "EUR"


def test_switching_the_currency_still_touches_no_amount(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    add_maintenance(client, headers, vehicle_id, 200)

    switch_currency(client, headers, "USD")

    history = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    line = history[0] if isinstance(history, list) else history["maintenances"][0]
    assert line["cost_paid"] == 200


# ── Les totaux ─────────────────────────────────────────────────────────────

def test_a_total_spanning_two_currencies_is_split_and_not_added(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]

    add_maintenance(client, headers, vehicle_id, 200)
    switch_currency(client, headers, "USD")
    add_maintenance(client, headers, vehicle_id, 300, date="2024-06-01T00:00:00")

    recap = client.get(f"/api/vehicles/{vehicle_id}/recap", headers=headers).json()

    assert recap["cost_by_currency"] == {"EUR": 200.0, "USD": 300.0}


def test_a_single_currency_total_is_the_ordinary_case(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    add_maintenance(client, headers, vehicle_id, 200)

    recap = client.get(f"/api/vehicles/{vehicle_id}/recap", headers=headers).json()

    assert recap["cost_by_currency"] == {"EUR": 200.0}


# ── La conversion ──────────────────────────────────────────────────────────

def test_a_dry_run_announces_without_touching_anything(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    add_maintenance(client, headers, vehicle_id, 200)

    res = client.post(
        "/api/admin/currency/convert",
        json={"code": "USD", "rate": 1.1, "dry_run": True},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dry_run"] is True
    assert body["counts"]["maintenances"] == 1

    history = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    line = history[0] if isinstance(history, list) else history["maintenances"][0]
    assert line["cost_paid"] == 200
    assert client.get("/api/auth/me", headers=headers).json()["effective"]["currency"] == "EUR"


def test_converting_recalculates_restamps_and_switches_the_setting(client, open_registration):
    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    add_maintenance(client, headers, vehicle_id, 200)

    res = client.post(
        "/api/admin/currency/convert",
        json={"code": "USD", "rate": 1.1, "dry_run": False},
        headers=headers,
    )
    assert res.status_code == 200, res.text

    history = client.get(f"/api/vehicles/{vehicle_id}/maintenances", headers=headers).json()
    line = history[0] if isinstance(history, list) else history["maintenances"][0]
    assert line["cost_paid"] == 220.0
    assert line["currency"] == "USD"
    assert client.get("/api/auth/me", headers=headers).json()["effective"]["currency"] == "USD"


def test_converting_leaves_a_third_currency_alone(client, open_registration, db_session):
    """Le taux fourni vaut pour un couple, pas pour toutes les monnaies."""
    from models import Maintenance

    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    untouched = add_maintenance(client, headers, vehicle_id, 100)

    row = db_session.get(Maintenance, untouched["id"])
    row.currency = "GBP"
    db_session.commit()

    add_maintenance(client, headers, vehicle_id, 200, date="2024-06-01T00:00:00")

    client.post(
        "/api/admin/currency/convert",
        json={"code": "USD", "rate": 2, "dry_run": False},
        headers=headers,
    )

    db_session.expire_all()
    assert db_session.get(Maintenance, untouched["id"]).cost_paid == 100
    assert db_session.get(Maintenance, untouched["id"]).currency == "GBP"


def test_converting_to_the_active_currency_is_refused(client, open_registration):
    headers = admin_headers(client)
    res = client.post(
        "/api/admin/currency/convert",
        json={"code": "EUR", "rate": 1.1, "dry_run": False},
        headers=headers,
    )
    assert res.status_code == 400


def test_a_non_positive_rate_is_refused(client, open_registration):
    headers = admin_headers(client)
    res = client.post(
        "/api/admin/currency/convert",
        json={"code": "USD", "rate": 0, "dry_run": True},
        headers=headers,
    )
    assert res.status_code == 422


def test_an_ordinary_member_cannot_convert(client, open_registration):
    admin_headers(client)
    register(client, "bob")
    headers = auth_headers(token_of(client, "bob"))

    res = client.post(
        "/api/admin/currency/convert",
        json={"code": "USD", "rate": 1.1, "dry_run": True},
        headers=headers,
    )
    assert res.status_code == 403
