"""
Tests du contrôle d'accès aux véhicules (`routes/access.py`).

Ces quatre fonctions sont le point de passage unique de la règle « cet appelant
a-t-il le droit de voir ce véhicule ? ». Avant leur extraction, cette règle
était réécrite dans 28 routes : ces tests la figent une bonne fois, pour que
toute évolution du partage soit un choix explicite et non un effet de bord.

Deux propriétés méritent une attention particulière :

- l'asymétrie du compte d'intégration Home Assistant, qui lit tout et n'écrit
  rien ;
- l'absence de fuite d'information : un véhicule qui appartient à autrui doit
  être indiscernable d'un véhicule inexistant.
"""

import pytest
from fastapi import HTTPException

from models import User, Vehicle
from routes.access import (
    get_owned_vehicle,
    get_readable_vehicle,
    list_owned_vehicles,
    list_readable_vehicles,
)


def _make_user(db, username, *, integration=False):
    user = User(
        username=username,
        display_name=username.capitalize(),
        password_hash="x",
        is_integration_account=integration,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_vehicle(db, owner, name="Bolide"):
    vehicle = Vehicle(
        name=name,
        vehicle_type="motorcycle",
        brand="Yamaha",
        model="MT-07",
        year=2022,
        motorization="essence",
        displacement=689,
        range_category="accessible",
        current_mileage=10_000,
        user_id=owner.id,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@pytest.fixture()
def cast(db_session):
    """Deux utilisateurs ordinaires, un compte d'intégration, un véhicule chacun."""
    alice = _make_user(db_session, "alice")
    bob = _make_user(db_session, "bob")
    ha = _make_user(db_session, "homeassistant", integration=True)
    return {
        "db": db_session,
        "alice": alice,
        "bob": bob,
        "ha": ha,
        "alice_vehicle": _make_vehicle(db_session, alice, "Moto d'Alice"),
        "bob_vehicle": _make_vehicle(db_session, bob, "Moto de Bob"),
    }


# ── Accès unitaire en écriture (propriétaire strict) ────────────────────────

def test_owner_can_write_their_own_vehicle(cast):
    found = get_owned_vehicle(cast["alice_vehicle"].id, cast["alice"], cast["db"])
    assert found.id == cast["alice_vehicle"].id


def test_write_on_someone_elses_vehicle_is_refused(cast):
    with pytest.raises(HTTPException) as exc:
        get_owned_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert exc.value.status_code == 404


def test_integration_account_cannot_write(cast):
    """Home Assistant alimente des capteurs ; il n'a jamais eu à écrire."""
    with pytest.raises(HTTPException) as exc:
        get_owned_vehicle(cast["alice_vehicle"].id, cast["ha"], cast["db"])
    assert exc.value.status_code == 404


# ── Accès unitaire en lecture (propriétaire + intégration) ──────────────────

def test_owner_can_read_their_own_vehicle(cast):
    found = get_readable_vehicle(cast["alice_vehicle"].id, cast["alice"], cast["db"])
    assert found.id == cast["alice_vehicle"].id


def test_integration_account_can_read_any_vehicle(cast):
    for key in ("alice_vehicle", "bob_vehicle"):
        found = get_readable_vehicle(cast[key].id, cast["ha"], cast["db"])
        assert found.id == cast[key].id


def test_read_on_someone_elses_vehicle_is_refused(cast):
    with pytest.raises(HTTPException) as exc:
        get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert exc.value.status_code == 404


# ── Non-divulgation ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("helper", [get_owned_vehicle, get_readable_vehicle])
def test_foreign_vehicle_is_indistinguishable_from_a_missing_one(cast, helper):
    """
    Un 403 sur le véhicule d'autrui et un 404 sur un identifiant libre
    laisseraient énumérer le parc de toute l'instance en bouclant sur les id.
    Les deux réponses doivent être identiques, code ET message.
    """
    with pytest.raises(HTTPException) as foreign:
        helper(cast["alice_vehicle"].id, cast["bob"], cast["db"])

    with pytest.raises(HTTPException) as missing:
        helper(999_999, cast["bob"], cast["db"])

    assert foreign.value.status_code == missing.value.status_code == 404
    assert foreign.value.detail == missing.value.detail


# ── Listes ──────────────────────────────────────────────────────────────────

def test_owned_list_holds_only_ones_own_vehicles(cast):
    owned = list_owned_vehicles(cast["alice"], cast["db"])
    assert [v.id for v in owned] == [cast["alice_vehicle"].id]


def test_owned_list_excludes_everything_for_the_integration_account(cast):
    """`list_owned_vehicles` ne connaît pas d'exception : le compte
    d'intégration ne possède aucun véhicule, il n'en voit donc aucun."""
    assert list_owned_vehicles(cast["ha"], cast["db"]) == []


def test_readable_list_holds_only_ones_own_vehicles_for_a_normal_user(cast):
    readable = list_readable_vehicles(cast["bob"], cast["db"])
    assert [v.id for v in readable] == [cast["bob_vehicle"].id]


def test_readable_list_spans_every_user_for_the_integration_account(cast):
    readable = list_readable_vehicles(cast["ha"], cast["db"])
    assert {v.id for v in readable} == {
        cast["alice_vehicle"].id,
        cast["bob_vehicle"].id,
    }
