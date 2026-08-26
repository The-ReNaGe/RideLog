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

from models import Family, FamilyMember, User, Vehicle
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


# ════════════════════════════════════════════════════════════════════════════
# Partage famille
# ════════════════════════════════════════════════════════════════════════════

def _make_family(db, name, owner, *members):
    family = Family(name=name, created_by=owner.id)
    db.add(family)
    db.commit()
    db.refresh(family)

    db.add(FamilyMember(family_id=family.id, user_id=owner.id, role="owner"))
    for member in members:
        db.add(FamilyMember(family_id=family.id, user_id=member.id, role="member"))
    db.commit()
    return family


def test_a_member_can_read_another_members_vehicle(cast):
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])

    found = get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert found.id == cast["alice_vehicle"].id


def test_a_member_still_cannot_write_another_members_vehicle(cast):
    """
    Le partage est en lecture seule. Un entretien saisi par erreur sur le
    véhicule d'un autre fausserait durablement ses échéances.
    """
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])

    with pytest.raises(HTTPException) as exc:
        get_owned_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert exc.value.status_code == 404


def test_a_private_vehicle_stays_hidden_from_the_group(cast):
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])
    cast["alice_vehicle"].is_private = True
    cast["db"].commit()

    with pytest.raises(HTTPException) as exc:
        get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert exc.value.status_code == 404


def test_a_private_vehicle_remains_visible_to_its_own_owner(cast):
    """« Privé » veut dire caché du groupe, jamais caché de soi."""
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])
    cast["alice_vehicle"].is_private = True
    cast["db"].commit()

    found = get_readable_vehicle(cast["alice_vehicle"].id, cast["alice"], cast["db"])
    assert found.id == cast["alice_vehicle"].id

    # Alice appartient au groupe : sa liste contient aussi le véhicule de Bob.
    # Ce qui compte ici, c'est que le sien, pourtant privé, n'en soit pas sorti.
    readable_ids = {v.id for v in list_readable_vehicles(cast["alice"], cast["db"])}
    assert cast["alice_vehicle"].id in readable_ids


def test_a_vehicle_predating_the_migration_is_shared_not_hidden(cast):
    """
    Les lignes antérieures à la migration 008 peuvent porter NULL plutôt que 0.
    Une égalité stricte à False les rendrait invisibles au groupe sans que
    personne ne l'ait demandé.
    """
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])
    cast["alice_vehicle"].is_private = None
    cast["db"].commit()

    found = get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], cast["db"])
    assert found.id == cast["alice_vehicle"].id


def test_the_shared_list_holds_both_ones_own_and_the_groups_vehicles(cast):
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])

    readable = list_readable_vehicles(cast["bob"], cast["db"])
    assert {v.id for v in readable} == {
        cast["bob_vehicle"].id,
        cast["alice_vehicle"].id,
    }


def test_sharing_never_widens_what_one_owns(cast):
    """`list_owned_vehicles` alimente le dashboard et le planning : le partage
    ne doit pas y faire entrer les véhicules des autres."""
    _make_family(cast["db"], "Foyer", cast["alice"], cast["bob"])

    assert [v.id for v in list_owned_vehicles(cast["bob"], cast["db"])] == [
        cast["bob_vehicle"].id
    ]


def test_two_separate_groups_never_see_each_other(cast):
    db = cast["db"]
    carol = _make_user(db, "carol")
    carol_vehicle = _make_vehicle(db, carol, "Moto de Carol")

    _make_family(db, "Foyer A", cast["alice"], cast["bob"])
    _make_family(db, "Foyer B", carol)

    with pytest.raises(HTTPException):
        get_readable_vehicle(carol_vehicle.id, cast["bob"], db)
    with pytest.raises(HTTPException):
        get_readable_vehicle(cast["alice_vehicle"].id, carol, db)


def test_leaving_the_group_withdraws_visibility_at_once(cast):
    db = cast["db"]
    _make_family(db, "Foyer", cast["alice"], cast["bob"])
    assert get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], db)

    db.query(FamilyMember).filter(FamilyMember.user_id == cast["bob"].id).delete()
    db.commit()

    with pytest.raises(HTTPException) as exc:
        get_readable_vehicle(cast["alice_vehicle"].id, cast["bob"], db)
    assert exc.value.status_code == 404


def test_without_any_group_nothing_changes(cast):
    """
    Le comportement d'une instance qui ne crée aucun groupe doit être
    identique à celui d'avant la fonctionnalité — c'est la garantie que le
    partage est une addition et non une modification.
    """
    assert [v.id for v in list_readable_vehicles(cast["alice"], cast["db"])] == [
        cast["alice_vehicle"].id
    ]
    with pytest.raises(HTTPException):
        get_readable_vehicle(cast["bob_vehicle"].id, cast["alice"], cast["db"])
