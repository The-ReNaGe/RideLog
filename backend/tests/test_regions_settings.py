"""
Choix du pays de l'instance.

Ce que ces tests verrouillent, et pourquoi
──────────────────────────────────────────
Le pays décide du format de plaque et du service qui la décode. Trois
propriétés comptent, et chacune protège d'une régression qu'on ne verrait
pas autrement :

  - **le réglage survit au redémarrage.** `REGISTRATION_MODE` et le flag
    d'intégration HA sont des variables module-level qui repassent à leur
    défaut à chaque démarrage (§19). Reproduire ce schéma ici aurait replacé
    une instance étrangère sur la France au premier `docker compose up -d`,
    sans un mot dans les logs ;
  - **un pays inconnu est refusé, pas absorbé.** `get_region()` retombe
    volontairement sur la France pour un code inconnu — bon au démarrage,
    désastreux dans un formulaire, où l'admin croirait avoir changé de pays ;
  - **une valeur stockée qu'une version plus ancienne ne connaît pas ne casse
    rien.** C'est le scénario de retour arrière du §21.5 : l'image redescend,
    `regions/be.py` n'existe plus, et le décodage de plaque doit continuer de
    fonctionner en France plutôt que d'échouer à chaque appel.
"""

from tests.test_families import (
    auth_headers,
    make_vehicle,
    open_registration,
    register,
    token_of,
)


def admin_headers(client):
    """Le premier compte créé est administrateur (cf. test_auth_integration)."""
    register(client, "alice")
    return auth_headers(token_of(client, "alice"))


def member_headers(client):
    register(client, "bob")
    return auth_headers(token_of(client, "bob"))


# ── Lecture ────────────────────────────────────────────────────────────────

def test_listing_the_countries_requires_a_token(client, open_registration):
    assert client.get("/api/regions").status_code in (401, 403)


def test_france_is_the_country_out_of_the_box(client, open_registration):
    headers = admin_headers(client)

    body = client.get("/api/regions", headers=headers).json()

    assert body["active"] == "FR"
    assert [r["code"] for r in body["regions"]] == ["FR"]
    assert body["regions"][0]["plate_example"] == "AB-123-CD"


# ── Écriture ───────────────────────────────────────────────────────────────

def test_an_ordinary_member_cannot_change_the_country(client, open_registration):
    admin_headers(client)  # le premier compte prend le rôle admin
    headers = member_headers(client)

    res = client.put("/api/admin/region", json={"code": "FR"}, headers=headers)

    assert res.status_code == 403


def test_an_unknown_country_is_refused_and_the_message_names_the_known_ones(
    client, open_registration
):
    headers = admin_headers(client)

    res = client.put("/api/admin/region", json={"code": "BE"}, headers=headers)

    assert res.status_code == 400
    assert "BE" in res.json()["detail"]
    assert "FR" in res.json()["detail"]


def test_the_chosen_country_is_stored_in_the_database_not_in_memory(
    client, open_registration, db_session
):
    from models import AppSetting
    from settings_store import REGION_KEY

    headers = admin_headers(client)
    client.put("/api/admin/region", json={"code": "fr"}, headers=headers)

    # Lu directement en base : c'est ce qui garantit la survie au redémarrage.
    row = db_session.get(AppSetting, REGION_KEY)
    assert row is not None and row.value == "FR"  # normalisé en majuscules


# ── Ordre de priorité ──────────────────────────────────────────────────────

def test_without_any_choice_the_environment_variable_still_decides(
    db_session, monkeypatch
):
    """Une instance qui tourne avec REGION dans son .env ne change pas de
    comportement tant que personne n'a touché au réglage."""
    from settings_store import get_active_region_code

    monkeypatch.setenv("REGION", "FR")
    assert get_active_region_code(db_session) == "FR"


def test_a_stored_country_this_version_does_not_know_falls_back_to_france(db_session):
    """Scénario de retour arrière (§21.5) : la base garde un pays que l'image
    redescendue ne connaît plus. Le décodage doit continuer, pas échouer."""
    from settings_store import REGION_KEY, get_active_region, get_active_region_code, set_setting

    set_setting(db_session, REGION_KEY, "BE")

    assert get_active_region_code(db_session) == "FR"
    assert get_active_region(db_session).code == "FR"


def test_the_stored_choice_wins_over_the_environment(db_session, monkeypatch):
    from settings_store import REGION_KEY, get_active_region_code, set_setting

    monkeypatch.setenv("REGION", "XX")  # code inconnu : get_region() replierait sur FR
    set_setting(db_session, REGION_KEY, "FR")

    assert get_active_region_code(db_session) == "FR"


# ═══════════════════════════════════════════════════════════════════════════
# Devise
# ═══════════════════════════════════════════════════════════════════════════
#
# ⚠️ La devise est un SYMBOLE, pas une conversion. Les montants sont stockés
# comme des nombres nus : changer de devise ne les recalcule pas, et ne le doit
# pas. Un plein à 60 saisi en euros reste 60 après un passage au dollar.
#
# Convertir supposerait un taux de change à la date de chaque ligne — donc un
# service externe et un historique qui bougerait tout seul. Pour une
# application auto-hébergée qui suit les dépenses d'un foyer, l'utilisateur
# saisit dans SA monnaie et le réglage dit seulement comment l'écrire.

def test_the_currency_comes_from_the_country_by_default(client, open_registration):
    headers = admin_headers(client)

    body = client.get("/api/auth/me", headers=headers).json()

    assert body["effective"]["currency"] == "EUR"
    assert body["effective"]["currency_symbol"] == "€"


def test_an_admin_can_switch_the_currency(client, open_registration):
    headers = admin_headers(client)

    res = client.put("/api/admin/currency", json={"code": "usd"}, headers=headers)
    assert res.status_code == 200, res.text

    body = client.get("/api/auth/me", headers=headers).json()
    assert body["effective"]["currency"] == "USD"
    assert body["effective"]["currency_symbol"] == "$"


def test_an_unknown_currency_is_refused(client, open_registration):
    headers = admin_headers(client)

    res = client.put("/api/admin/currency", json={"code": "XYZ"}, headers=headers)

    assert res.status_code == 400
    assert "XYZ" in res.json()["detail"]
    assert client.get("/api/auth/me", headers=headers).json()["effective"]["currency"] == "EUR"


def test_an_ordinary_member_cannot_change_the_currency(client, open_registration):
    admin_headers(client)
    headers = member_headers(client)

    assert client.put("/api/admin/currency", json={"code": "USD"}, headers=headers).status_code == 403


def test_changing_the_currency_never_touches_a_stored_amount(client, open_registration, db_session):
    """Le garde-fou qui compte : c'est un symbole, pas un taux de change."""
    from settings_store import CURRENCY_KEY, set_setting

    headers = admin_headers(client)
    vehicle_id = make_vehicle(client, headers)["id"]
    before = client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()

    set_setting(db_session, CURRENCY_KEY, "USD")

    after = client.get(f"/api/vehicles/{vehicle_id}", headers=headers).json()
    assert after["current_mileage"] == before["current_mileage"]  # au chiffre près
