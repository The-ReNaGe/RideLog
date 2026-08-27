"""
État d'entretien joint à `GET /vehicles`.

L'accueil ne disait rien de l'état des véhicules : il fallait ouvrir chaque
fiche pour savoir qu'un entretien était en retard. Ces tests verrouillent les
deux propriétés qui comptent :

  - les compteurs sont ceux de « À venir », pas une seconde vérité ;
  - un véhicule **partagé par le groupe famille** les porte aussi. C'est le
    piège de ce lot : le tableau de bord calcule déjà ces compteurs, mais via
    `list_owned_vehicles`. S'en servir aurait laissé les garages des autres
    membres sans pastille — et une pastille absente se lit « à jour », pas
    « inconnu ».
"""

import pytest

from tests.test_families import (  # helpers déjà éprouvés
    auth_headers,
    household,
    make_vehicle,
    open_registration,
    register,
    token_of,
)

STATE_FIELDS = {"overdue_count", "urgent_count", "warning_count", "alert_level"}
SEVERITY = ("overdue", "urgent", "warning")


def vehicles_of(client, headers):
    res = client.get("/api/vehicles", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_the_list_carries_the_maintenance_state(client, open_registration):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))
    make_vehicle(client, headers)

    (vehicle,) = vehicles_of(client, headers)
    assert STATE_FIELDS <= set(vehicle)
    assert vehicle["alert_level"] in SEVERITY + ("ok",)


def test_the_level_is_the_most_severe_level_present(client, open_registration):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))
    make_vehicle(client, headers)

    (vehicle,) = vehicles_of(client, headers)
    expected = next((s for s in SEVERITY if vehicle[f"{s}_count"] > 0), "ok")
    assert vehicle["alert_level"] == expected


def test_the_counts_agree_with_the_upcoming_endpoint(client, open_registration):
    """Deux façons de compter la même chose doivent tomber d'accord."""
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))
    created = make_vehicle(client, headers)

    upcoming = client.get(f"/api/vehicles/{created['id']}/upcoming", headers=headers).json()
    items = upcoming["upcoming"]

    (vehicle,) = vehicles_of(client, headers)
    for level in SEVERITY:
        assert vehicle[f"{level}_count"] == sum(1 for i in items if i["status"] == level), level


def test_a_vehicle_shared_by_the_group_also_carries_its_state(client, household):
    """La régression que ce lot existe pour empêcher."""
    listed = vehicles_of(client, household["bob"])
    alice_vehicle = next(v for v in listed if v["id"] == household["alice_vehicle"]["id"])

    assert STATE_FIELDS <= set(alice_vehicle)
    assert alice_vehicle["alert_level"] in SEVERITY + ("ok",)


def test_both_members_see_the_same_state_for_the_same_vehicle(client, household):
    """L'état est celui du véhicule, pas celui de qui le regarde."""
    vehicle_id = household["alice_vehicle"]["id"]

    seen_by_owner = next(v for v in vehicles_of(client, household["alice"]) if v["id"] == vehicle_id)
    seen_by_member = next(v for v in vehicles_of(client, household["bob"]) if v["id"] == vehicle_id)

    assert {k: seen_by_owner[k] for k in STATE_FIELDS} == {k: seen_by_member[k] for k in STATE_FIELDS}
