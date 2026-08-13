"""
Tests de non-régression sur l'identification de l'IP client, le verrouillage
anti-bruteforce et le garde-fou JWT_SECRET.

Deux failles réelles sont verrouillées ici, toutes deux reproduites à la main
contre l'instance avant correctif :

1. `routes/auth.py` lisait `X-Forwarded-For[0]`, alors que nginx construit cet
   en-tête avec `$proxy_add_x_forwarded_for` — qui *ajoute* l'IP réelle derrière
   la valeur envoyée par le client. Le premier élément était donc contrôlé par
   l'appelant : 20 tentatives de login échouées, aucun 429.

2. Le correctif initial faisait confiance à toute adresse privée. Or Docker fait
   du SNAT sur les ports publiés : une requête venue d'Internet vers le port 8000
   arrive depuis la passerelle (172.18.0.1), une adresse privée. L'usurpation de
   X-Real-IP redevenait donc possible dès que 8000 était exposé — 15 tentatives,
   aucun 429. Seuls les proxys explicitement déclarés sont désormais approuvés.
"""

import ipaddress

import pytest
from starlette.requests import Request

import security
from security import (
    get_client_ip,
    validate_jwt_secret,
    DEFAULT_JWT_SECRET,
    LoginRateLimiter,
)


def make_request(peer: str, headers: dict | None = None) -> Request:
    """Construit une Request Starlette minimale avec un pair TCP et des en-têtes donnés."""
    raw_headers = [
        (key.lower().encode(), value.encode())
        for key, value in (headers or {}).items()
    ]
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": raw_headers,
        "client": (peer, 51234),
    })


@pytest.fixture()
def trust(monkeypatch):
    """Déclare une liste de proxys de confiance pour la durée du test."""
    def _trust(*entries):
        monkeypatch.setattr(security, "_TRUSTED_HOSTNAMES", [])
        monkeypatch.setattr(security, "_TRUSTED_NETWORKS", [
            ipaddress.ip_network(entry, strict=False) for entry in entries
        ])
    return _trust


# ═══════════════════════════════════════════════════════════════════════════
# get_client_ip
# ═══════════════════════════════════════════════════════════════════════════

def test_spoofed_forwarded_for_prefix_is_ignored(trust):
    """Faille n°1 : le client préfixe X-Forwarded-For de ce qu'il veut.

    nginx laisse sa valeur en tête et ajoute l'IP réelle en dernier. On parcourt
    donc la chaîne de droite à gauche, jamais depuis le début.
    """
    trust("172.18.0.3")
    request = make_request(
        "172.18.0.3",
        {"X-Forwarded-For": "198.51.100.99, 203.0.113.7"},
    )
    assert get_client_ip(request) == "203.0.113.7"


def test_untrusted_peer_ignores_all_headers(trust):
    """Faille n°2 : port 8000 exposé, requête arrivant par la passerelle Docker.

    La passerelle n'est pas un proxy déclaré : ses en-têtes ne valent rien,
    même si son adresse est privée.
    """
    trust("172.18.0.3")  # seul nginx est de confiance, pas la passerelle
    request = make_request("172.18.0.1", {
        "X-Real-IP": "198.18.5.5",
        "X-Forwarded-For": "198.18.5.5",
    })
    assert get_client_ip(request) == "172.18.0.1"


def test_no_trusted_proxy_configured_means_no_header_is_read():
    """Configuration vide (backend exposé nu) : seule la connexion fait foi."""
    request = make_request("203.0.113.10", {"X-Real-IP": "10.0.0.1"})
    assert get_client_ip(request) == "203.0.113.10"


def test_chained_proxies_skip_every_trusted_hop(trust):
    """Reverse proxy personnel devant le nginx fourni, tous deux déclarés."""
    trust("172.18.0.3", "172.18.0.1")
    request = make_request(
        "172.18.0.3",
        {"X-Forwarded-For": "203.0.113.7, 172.18.0.1"},
    )
    assert get_client_ip(request) == "203.0.113.7"


def test_undeclared_upstream_proxy_collapses_to_that_proxy(trust):
    """Proxy amont non déclaré : on retombe sur son IP — sûr, mais tous les
    visiteurs partagent alors le même compteur (d'où l'avertissement dans .env.example)."""
    trust("172.18.0.3")
    request = make_request(
        "172.18.0.3",
        {"X-Forwarded-For": "203.0.113.7, 172.18.0.1"},
    )
    assert get_client_ip(request) == "172.18.0.1"


def test_real_ip_used_when_no_forwarded_for(trust):
    trust("172.18.0.3")
    request = make_request("172.18.0.3", {"X-Real-IP": "203.0.113.7"})
    assert get_client_ip(request) == "203.0.113.7"


def test_falls_back_to_peer_without_headers(trust):
    trust("172.18.0.3")
    assert get_client_ip(make_request("172.18.0.3")) == "172.18.0.3"


def test_hostname_entries_are_resolved(monkeypatch):
    """TRUSTED_PROXIES accepte un nom de service Docker (l'IP du conteneur bouge)."""
    monkeypatch.setattr(security, "_TRUSTED_NETWORKS", [])
    monkeypatch.setattr(security, "_TRUSTED_HOSTNAMES", ["frontend"])
    monkeypatch.setattr(security, "_resolve_hostname", lambda name: frozenset({"172.18.0.3"}))

    request = make_request("172.18.0.3", {"X-Forwarded-For": "203.0.113.7"})
    assert get_client_ip(request) == "203.0.113.7"
    assert get_client_ip(make_request("172.18.0.1", {"X-Forwarded-For": "203.0.113.7"})) == "172.18.0.1"


# ═══════════════════════════════════════════════════════════════════════════
# Rate limiting : par IP et par compte
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def proxied_client(monkeypatch):
    """TestClient simulant une requête arrivant par nginx.

    Le TestClient de cette version de Starlette ne permet pas de choisir le pair
    TCP (il vaut toujours "testclient", qui n'est même pas une IP valide). On
    déclare donc ce pair comme proxy de confiance pour exercer le chemin où les
    en-têtes sont lus ; `_is_trusted_proxy` est couvert par les tests ci-dessus.
    """
    monkeypatch.setattr(security, "_is_trusted_proxy", lambda host: host == "testclient")

    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        yield c


def _register(client, username="victime", password="Password123"):
    return client.post("/api/auth/register", json={
        "username": username, "display_name": username,
        "password": password, "password_confirm": password,
    })


def test_rotating_forwarded_for_no_longer_bypasses_rate_limiting(proxied_client):
    """20 échecs avec un X-Forwarded-For différent à chaque fois → doit verrouiller."""
    _register(proxied_client)

    statuses = []
    for i in range(1, 21):
        res = proxied_client.post(
            "/api/auth/login",
            json={"username": "victime", "password": "mauvais"},
            headers={"X-Forwarded-For": f"198.51.100.{i}, 203.0.113.7"},
        )
        statuses.append(res.status_code)

    assert 429 in statuses, "le rate limiter est de nouveau contournable via X-Forwarded-For"


def test_distinct_real_clients_are_still_limited_independently(proxied_client):
    """Le verrouillage d'une IP ne doit pas retomber sur les autres utilisateurs."""
    _register(proxied_client)

    for _ in range(3):
        proxied_client.post(
            "/api/auth/login",
            json={"username": "victime", "password": "mauvais"},
            headers={"X-Real-IP": "203.0.113.7"},
        )

    blocked = proxied_client.post(
        "/api/auth/login",
        json={"username": "victime", "password": "Password123"},
        headers={"X-Real-IP": "203.0.113.7"},
    )
    assert blocked.status_code == 429

    other = proxied_client.post(
        "/api/auth/login",
        json={"username": "autre-compte-inexistant", "password": "Password123"},
        headers={"X-Real-IP": "203.0.113.8"},
    )
    assert other.status_code == 401  # rejeté sur le mot de passe, pas sur le quota


def test_account_is_locked_even_when_the_attacker_rotates_ips(proxied_client):
    """Filet de sécurité : une IP par tentative ne doit plus permettre le bruteforce.

    C'est le scénario d'un attaquant distribué, ou d'une instance dont l'IP
    n'est pas fiable (port 8000 exposé) : la limite par IP ne mord pas, seule
    celle par compte protège.
    """
    _register(proxied_client)

    statuses = []
    for i in range(1, 13):
        res = proxied_client.post(
            "/api/auth/login",
            json={"username": "victime", "password": "mauvais"},
            # Une IP réelle différente à chaque tentative : la limite par IP
            # ne se déclenche jamais.
            headers={"X-Real-IP": f"203.0.113.{i}"},
        )
        statuses.append(res.status_code)

    assert 429 in statuses, "le compte n'est pas protégé contre un bruteforce distribué"


def test_account_lockout_does_not_affect_other_accounts(proxied_client):
    """Verrouiller un compte ne doit pas empêcher les autres de se connecter."""
    _register(proxied_client, "victime")
    import config as app_config
    app_config.REGISTRATION_MODE = "open"
    _register(proxied_client, "temoin")

    for i in range(6):
        proxied_client.post(
            "/api/auth/login",
            json={"username": "victime", "password": "mauvais"},
            headers={"X-Real-IP": f"203.0.113.{i}"},
        )

    res = proxied_client.post(
        "/api/auth/login",
        json={"username": "temoin", "password": "Password123"},
        headers={"X-Real-IP": "203.0.113.200"},
    )
    assert res.status_code == 200


def test_account_limiter_thresholds_are_shorter_than_ip_ones():
    """Le compteur par compte est déclenchable par un tiers : le blocage doit
    rester court pour ne pas devenir une arme de déni de service."""
    from security import ACCOUNT_THRESHOLDS
    assert max(seconds for _, seconds in ACCOUNT_THRESHOLDS) <= 300


def test_limiter_thresholds_are_configurable():
    """La classe sert aux deux compteurs : les paliers doivent être injectables."""
    limiter = LoginRateLimiter(thresholds=[(2, 10)])
    limiter.record_failure("k")
    assert limiter.check("k") == 0
    limiter.record_failure("k")
    assert limiter.check("k") > 0


def test_default_limiter_keeps_its_historical_thresholds():
    """Non-régression : les paliers par IP (3/6/9/12+) ne changent pas."""
    limiter = LoginRateLimiter()
    for _ in range(3):
        limiter.record_failure("ip")
    assert 0 < limiter.check("ip") <= 30


# ═══════════════════════════════════════════════════════════════════════════
# JWT_SECRET
# ═══════════════════════════════════════════════════════════════════════════

def test_default_jwt_secret_refuses_to_start(monkeypatch):
    """La valeur par défaut est publique (dépôt ouvert) : démarrer avec elle
    permettrait de forger un token admin sans mot de passe."""
    monkeypatch.setattr(security, "JWT_SECRET", DEFAULT_JWT_SECRET)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_jwt_secret()


def test_empty_jwt_secret_refuses_to_start(monkeypatch):
    monkeypatch.setattr(security, "JWT_SECRET", "")
    with pytest.raises(RuntimeError):
        validate_jwt_secret()


def test_env_example_placeholder_refuses_to_start(monkeypatch):
    """Copier .env.example sans le remplir ne doit pas donner une instance qui démarre."""
    monkeypatch.setattr(security, "JWT_SECRET", "changez-moi-en-production")
    with pytest.raises(RuntimeError):
        validate_jwt_secret()


def test_configured_jwt_secret_starts(monkeypatch):
    monkeypatch.setattr(security, "JWT_SECRET", "x" * 48)
    validate_jwt_secret()


def test_short_secret_warns_but_starts(monkeypatch, caplog):
    monkeypatch.setattr(security, "JWT_SECRET", "trop-court")
    with caplog.at_level("WARNING"):
        validate_jwt_secret()
    assert any("JWT_SECRET" in record.message for record in caplog.records)
