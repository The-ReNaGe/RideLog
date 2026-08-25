"""
Tests d'intégration des groupes famille, via TestClient.

Deux choses distinctes sont vérifiées ici :

  - la mécanique d'appartenance (créer, inviter, rejoindre, quitter) ;
  - le fait que le partage reste en LECTURE SEULE de bout en bout, à travers
    les vraies routes HTTP et pas seulement au niveau du helper d'accès.

Le second point est le plus important : `test_access.py` prouve que la règle
est juste, celui-ci prouve que les routes l'appliquent réellement.
"""

import pytest

import config as app_config


def register(client, username, password="Password123", display_name=None, **extra):
    payload = {
        "username": username,
        "display_name": display_name or username,
        "password": password,
        "password_confirm": password,
    }
    payload.update(extra)
    return client.post("/api/auth/register", json=payload)


def login(client, username, password="Password123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def token_of(client, username, password="Password123"):
    return login(client, username, password).json()["access_token"]


@pytest.fixture()
def open_registration():
    """Inscriptions libres — évite de fabriquer une invitation à chaque compte."""
    previous = app_config.REGISTRATION_MODE
    app_config.REGISTRATION_MODE = "open"
    yield
    app_config.REGISTRATION_MODE = previous


def make_vehicle(client, headers, name="Bolide"):
    res = client.post(
        "/api/vehicles",
        headers=headers,
        json={
            "name": name,
            "vehicle_type": "motorcycle",
            "brand": "Yamaha",
            "model": "MT-07",
            "year": 2022,
            "motorization": "essence",
            "displacement": 689,
            "current_mileage": 10000,
        },
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


@pytest.fixture()
def household(client, open_registration):
    """Alice (créatrice du groupe) et Bob (invité), chacun avec un véhicule."""
    register(client, "alice")
    register(client, "bob")
    alice, bob = auth_headers(token_of(client, "alice")), auth_headers(token_of(client, "bob"))

    alice_vehicle = make_vehicle(client, alice, "Moto d'Alice")
    bob_vehicle = make_vehicle(client, bob, "Moto de Bob")

    client.post("/api/family", headers=alice, json={"name": "Foyer"})
    token = client.post("/api/family/invitations", headers=alice).json()["token"]
    assert client.post("/api/family/join", headers=bob, json={"token": token}).status_code == 200

    return {
        "alice": alice, "bob": bob,
        "alice_vehicle": alice_vehicle, "bob_vehicle": bob_vehicle,
    }


# ── Cycle de vie du groupe ──────────────────────────────────────────────────

def test_a_user_starts_without_any_group(client, open_registration):
    register(client, "alice")
    res = client.get("/api/family", headers=auth_headers(token_of(client, "alice")))
    assert res.status_code == 200
    assert res.json()["family"] is None


def test_creating_a_group_makes_you_its_owner(client, open_registration):
    register(client, "alice")
    res = client.post(
        "/api/family", headers=auth_headers(token_of(client, "alice")), json={"name": "Foyer"}
    )
    assert res.status_code == 201
    assert res.json()["role"] == "owner"
    assert res.json()["family"]["name"] == "Foyer"


def test_one_cannot_belong_to_two_groups(client, open_registration):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))
    client.post("/api/family", headers=headers, json={"name": "Foyer"})

    res = client.post("/api/family", headers=headers, json={"name": "Autre"})
    assert res.status_code == 409


def test_joining_puts_both_members_in_the_group(client, household):
    res = client.get("/api/family", headers=household["bob"])
    assert res.status_code == 200
    assert res.json()["role"] == "member"
    assert {m["username"] for m in res.json()["family"]["members"]} == {"alice", "bob"}


def test_only_the_owner_can_rename_the_group(client, household):
    assert client.patch(
        "/api/family", headers=household["bob"], json={"name": "Renommé"}
    ).status_code == 403
    assert client.patch(
        "/api/family", headers=household["alice"], json={"name": "Renommé"}
    ).status_code == 200


def test_only_the_owner_can_remove_a_member(client, household):
    members = client.get("/api/family", headers=household["alice"]).json()["family"]["members"]
    alice_id = next(m["user_id"] for m in members if m["username"] == "alice")
    bob_id = next(m["user_id"] for m in members if m["username"] == "bob")

    assert client.delete(
        f"/api/family/members/{alice_id}", headers=household["bob"]
    ).status_code == 403
    assert client.delete(
        f"/api/family/members/{bob_id}", headers=household["alice"]
    ).status_code == 200
    assert client.get("/api/family", headers=household["bob"]).json()["family"] is None


# ── Invitations ─────────────────────────────────────────────────────────────

def test_an_invitation_cannot_serve_twice(client, household, open_registration):
    register(client, "carol")
    carol = auth_headers(token_of(client, "carol"))

    used = client.get("/api/family/invitations", headers=household["alice"]).json()
    assert used == [], "l'invitation consommée ne doit plus figurer parmi les actives"

    fresh = client.post("/api/family/invitations", headers=household["alice"]).json()["token"]
    assert client.post("/api/family/join", headers=carol, json={"token": fresh}).status_code == 200

    register(client, "dave")
    dave = auth_headers(token_of(client, "dave"))
    res = client.post("/api/family/join", headers=dave, json={"token": fresh})
    assert res.status_code == 410


def test_a_revoked_invitation_no_longer_works(client, household, open_registration):
    register(client, "carol")
    carol = auth_headers(token_of(client, "carol"))

    invitation = client.post("/api/family/invitations", headers=household["alice"]).json()
    client.delete(f"/api/family/invitations/{invitation['id']}", headers=household["alice"])

    res = client.post("/api/family/join", headers=carol, json={"token": invitation["token"]})
    assert res.status_code == 404


def test_a_member_of_another_group_cannot_revoke_your_invitation(client, household, open_registration):
    """Sans filtre sur le groupe, n'importe quel membre révoquerait les
    invitations d'un autre foyer — y compris celles émises par un admin."""
    register(client, "carol")
    carol = auth_headers(token_of(client, "carol"))
    client.post("/api/family", headers=carol, json={"name": "Autre foyer"})

    invitation = client.post("/api/family/invitations", headers=household["alice"]).json()
    res = client.delete(f"/api/family/invitations/{invitation['id']}", headers=carol)
    assert res.status_code == 404


def test_registering_through_a_group_link_joins_the_group(client, household):
    """Le lien sert aussi à qui n'a pas encore de compte."""
    token = client.post("/api/family/invitations", headers=household["alice"]).json()["token"]

    app_config.REGISTRATION_MODE = "invite"
    res = register(client, "erin", invite_token=token)
    assert res.status_code == 201

    erin = auth_headers(token_of(client, "erin"))
    assert client.get("/api/family", headers=erin).json()["family"]["name"] == "Foyer"


def test_check_invite_announces_the_group(client, household):
    """La page d'inscription doit pouvoir dire ce qu'on rejoint."""
    token = client.post("/api/family/invitations", headers=household["alice"]).json()["token"]
    res = client.get(f"/api/auth/check-invite/{token}")
    assert res.status_code == 200
    assert res.json()["family"]["name"] == "Foyer"


def test_a_closed_instance_still_refuses_registration_through_a_group_link(client, household):
    """
    Un lien de groupe ne doit pas ouvrir une inscription là où l'administrateur
    l'a fermée. Le contrôle vient de REGISTRATION_MODE, que le rattachement
    famille ne court-circuite pas.
    """
    token = client.post("/api/family/invitations", headers=household["alice"]).json()["token"]

    app_config.REGISTRATION_MODE = "closed"
    res = register(client, "mallory", invite_token=token)
    assert res.status_code == 403


def test_pending_invitations_are_capped(client, household):
    from routes.families import MAX_PENDING_INVITATIONS

    # Celle du fixture a été consommée : elle ne compte pas comme en attente.
    for _ in range(MAX_PENDING_INVITATIONS):
        assert client.post(
            "/api/family/invitations", headers=household["alice"]
        ).status_code == 201

    res = client.post("/api/family/invitations", headers=household["alice"])
    assert res.status_code == 429


# ── Le partage, à travers les vraies routes ─────────────────────────────────

def test_a_member_sees_the_others_vehicle_in_the_list(client, household):
    listed = client.get("/api/vehicles", headers=household["bob"]).json()
    assert {v["name"] for v in listed} == {"Moto de Bob", "Moto d'Alice"}


def test_a_member_can_open_the_others_vehicle(client, household):
    vid = household["alice_vehicle"]["id"]
    assert client.get(f"/api/vehicles/{vid}", headers=household["bob"]).status_code == 200
    assert client.get(f"/api/vehicles/{vid}/upcoming", headers=household["bob"]).status_code == 200
    assert client.get(f"/api/vehicles/{vid}/fuel-logs", headers=household["bob"]).status_code == 200


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("put", "", {"current_mileage": 99999}),
        ("delete", "", None),
        ("post", "/fuel-logs", {
            "fill_date": "2026-01-01T00:00:00", "mileage_at_fill": 11000,
            "total_cost": 20.0, "price_per_liter": 1.8,
        }),
    ],
)
def test_a_member_cannot_write_on_the_others_vehicle(client, household, method, path, body):
    """
    Le point le plus important de la fonctionnalité : le partage est en
    lecture. Vérifié route par route, pas seulement sur le helper d'accès.
    """
    url = f"/api/vehicles/{household['alice_vehicle']['id']}{path}"
    call = getattr(client, method)
    res = call(url, headers=household["bob"], **({"json": body} if body else {}))
    assert res.status_code == 404, f"{method.upper()} {url} a répondu {res.status_code}"


def test_a_private_vehicle_disappears_from_the_group(client, household):
    vid = household["alice_vehicle"]["id"]
    assert client.put(
        f"/api/vehicles/{vid}", headers=household["alice"], json={"is_private": True}
    ).status_code == 200

    assert client.get(f"/api/vehicles/{vid}", headers=household["bob"]).status_code == 404
    listed = client.get("/api/vehicles", headers=household["bob"]).json()
    assert {v["name"] for v in listed} == {"Moto de Bob"}
    # Son propriétaire continue de le voir.
    assert client.get(f"/api/vehicles/{vid}", headers=household["alice"]).status_code == 200


def test_the_dashboard_stays_personal(client, household):
    """Le dashboard agrège `list_owned_vehicles` : le partage ne doit pas y
    faire entrer les véhicules des autres."""
    res = client.get("/api/dashboard", headers=household["bob"]).json()
    assert res["total_vehicles"] == 1


def test_leaving_the_group_withdraws_visibility(client, household):
    assert client.post("/api/family/leave", headers=household["bob"]).status_code == 200

    vid = household["alice_vehicle"]["id"]
    assert client.get(f"/api/vehicles/{vid}", headers=household["bob"]).status_code == 404
    listed = client.get("/api/vehicles", headers=household["bob"]).json()
    assert {v["name"] for v in listed} == {"Moto de Bob"}


def test_the_last_member_leaving_dissolves_the_group(client, household):
    client.post("/api/family/leave", headers=household["bob"])
    res = client.post("/api/family/leave", headers=household["alice"])
    assert res.json() == {"left": True, "family_deleted": True}
    assert client.get("/api/family", headers=household["alice"]).json()["family"] is None


def test_ownership_passes_on_when_the_owner_leaves(client, household):
    """Un groupe sans propriétaire ne pourrait plus être ni renommé ni dissous."""
    assert client.post("/api/family/leave", headers=household["alice"]).json() == {
        "left": True, "family_deleted": False
    }
    assert client.get("/api/family", headers=household["bob"]).json()["role"] == "owner"
