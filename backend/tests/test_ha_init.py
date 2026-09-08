"""
Tests de `/api/auth/ha-init` — la route qui délivre le jeton Home Assistant.

Cette route mérite une attention particulière : le jeton qu'elle rend vaut
30 jours et donne accès en lecture aux véhicules de TOUS les utilisateurs
(`list_readable_vehicles` ne filtre pas un compte d'intégration). C'est le
sésame le plus large de l'instance, et il était jusqu'ici la seule route
sensible sans plafond de tentatives.

Deux comportements sont verrouillés ici :

1. la clé se transmet par un EN-TÊTE, le paramètre d'URL n'étant qu'un repli
   déprécié — une query string est journalisée en clair par uvicorn
   (`--access-log`) comme par le nginx du frontend (format « combined ») ;
2. les tentatives sont plafonnées par IP, comme sur `/auth/login`.
"""

import pytest

from routes.auth import HA_INIT_KEY_HEADER

VALID_KEY = "test-ha-init-key"  # posée par conftest.py dans l'environnement


def ha_init_with_header(client, key=VALID_KEY):
    return client.post("/api/auth/ha-init", headers={HA_INIT_KEY_HEADER: key})


def ha_init_with_query(client, key=VALID_KEY):
    return client.post("/api/auth/ha-init", params={"init_key": key})


# ═══════════════════════════════════════════════════════════════════════════
# Transmission de la clé
# ═══════════════════════════════════════════════════════════════════════════

def test_the_key_is_accepted_in_a_header(client):
    """Le chemin normal depuis la 2.5 : rien de secret dans l'URL."""
    res = ha_init_with_header(client)
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_the_header_name_is_case_insensitive(client):
    """Les en-têtes HTTP le sont ; un proxy peut normaliser la casse."""
    res = client.post("/api/auth/ha-init", headers={"x-ha-init-key": VALID_KEY})
    assert res.status_code == 200


def test_the_query_string_still_works_for_older_integrations(client):
    """
    Repli déprécié, délibérément conservé : une intégration pas encore mise à
    jour doit pouvoir se configurer. Le refuser aurait transformé un correctif
    de sécurité en panne pour tout le monde.
    """
    res = ha_init_with_query(client)
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_the_header_wins_over_the_query_string(client):
    """Une intégration à jour ne doit pas être refusée par un reliquat d'URL."""
    res = client.post(
        "/api/auth/ha-init",
        headers={HA_INIT_KEY_HEADER: VALID_KEY},
        params={"init_key": "une-vieille-cle-erronee"},
    )
    assert res.status_code == 200


def test_using_the_query_string_is_flagged_in_the_logs(client, caplog):
    """
    L'usage du repli doit LAISSER UNE TRACE : la clé vient d'être écrite en
    clair dans les journaux d'accès, son propriétaire doit savoir la changer.
    Un repli silencieux aurait laissé la fuite durer indéfiniment.
    """
    import logging
    with caplog.at_level(logging.WARNING, logger="ridelog.auth"):
        ha_init_with_query(client)
    assert any("paramètre d'URL" in r.message for r in caplog.records)


def test_the_warning_does_not_itself_leak_the_key(client, caplog):
    """Journaliser la clé pour prévenir qu'elle a fuité serait cocasse."""
    import logging
    with caplog.at_level(logging.WARNING, logger="ridelog.auth"):
        ha_init_with_query(client)
    assert all(VALID_KEY not in r.getMessage() for r in caplog.records)


# ═══════════════════════════════════════════════════════════════════════════
# Refus
# ═══════════════════════════════════════════════════════════════════════════

def test_a_wrong_key_is_refused(client):
    res = ha_init_with_header(client, key="mauvaise-cle")
    assert res.status_code == 403


def test_a_missing_key_is_refused(client):
    res = client.post("/api/auth/ha-init")
    assert res.status_code == 403


def test_a_non_ascii_key_is_refused_cleanly(client):
    """
    `hmac.compare_digest` lève un TypeError sur une str non-ASCII. Sans
    encodage préalable, une clé accentuée rendait un 500 — donc une trace
    d'exception dans les logs — au lieu d'un refus propre.

    Le test passe par le paramètre d'URL et non par l'en-tête, et ce n'est pas
    un détail : les en-têtes HTTP sont ASCII par spécification, httpx refuse
    net d'en envoyer un accentué. Une HA_INIT_KEY non-ASCII est donc
    intransmissible par l'intégration — d'où la consigne ajoutée à
    .env.example de s'en tenir à `openssl rand -hex 16`.
    """
    res = ha_init_with_query(client, key="clé-accentuée")
    assert res.status_code == 403


def test_a_disabled_integration_refuses_even_a_valid_key(client):
    """Le flag admin prime sur la clé — sinon « désactiver » ne désactive rien."""
    from routes import auth as auth_routes
    auth_routes._ha_integration_enabled = False
    res = ha_init_with_header(client)
    assert res.status_code == 403


def test_no_server_key_returns_503_not_403(client, monkeypatch):
    """
    503 et non 403 : le problème est une instance non configurée, pas une clé
    fausse. Les confondre envoie l'utilisateur vérifier sa clé pendant des
    heures alors que le serveur n'en a aucune.
    """
    from routes import auth as auth_routes
    monkeypatch.setattr(auth_routes, "HA_INIT_KEY", None)
    res = ha_init_with_header(client)
    assert res.status_code == 503


# ═══════════════════════════════════════════════════════════════════════════
# Rate limiting — l'absence de plafond était la faille
# ═══════════════════════════════════════════════════════════════════════════

def test_repeated_wrong_keys_are_eventually_rate_limited(client):
    """
    Trois échecs consécutifs verrouillent (LoginRateLimiter.THRESHOLDS), comme
    sur /auth/login. Sans ce plafond, la clé était devinable à volume illimité :
    `compare_digest` protège du timing, pas du nombre d'essais.
    """
    for _ in range(3):
        assert ha_init_with_header(client, key="mauvaise-cle").status_code == 403

    res = ha_init_with_header(client, key="mauvaise-cle")
    assert res.status_code == 429
    assert "Retry-After" in res.headers


def test_the_lockout_applies_even_to_the_right_key(client):
    """
    Une fois verrouillé, même la bonne clé attend : autrement, un attaquant
    testerait sans fin, chaque essai correct servant de reset.
    """
    for _ in range(3):
        ha_init_with_header(client, key="mauvaise-cle")
    assert ha_init_with_header(client).status_code == 429


def test_a_successful_init_clears_the_counter(client):
    """Home Assistant se reconfigure sans être puni pour d'anciens essais."""
    from security import login_limiter
    for _ in range(2):  # sous le seuil de 3
        ha_init_with_header(client, key="mauvaise-cle")

    assert ha_init_with_header(client).status_code == 200

    # Le compteur est reparti de zéro : deux échecs de plus ne verrouillent pas
    for _ in range(2):
        assert ha_init_with_header(client, key="mauvaise-cle").status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# Le compte lui-même
# ═══════════════════════════════════════════════════════════════════════════

def test_the_account_is_created_once_then_only_renewed(client, db_session):
    """
    Un second appel renouvelle le jeton sans créer de doublon — c'est le cas
    normal à chaque redémarrage de Home Assistant.
    """
    from models import User

    assert ha_init_with_header(client).status_code == 200
    assert ha_init_with_header(client).status_code == 200

    accounts = db_session.query(User).filter(User.username == "homeassistant").all()
    assert len(accounts) == 1
    assert accounts[0].is_integration_account is True
    assert accounts[0].is_admin is False
