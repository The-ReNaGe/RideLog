"""
Tests de non-régression sur l'identification de l'IP client et le garde-fou
JWT_SECRET.

Contexte : le rate limiter de login était contournable. `routes/auth.py` lisait
`X-Forwarded-For[0]`, alors que nginx construit cet en-tête avec
`$proxy_add_x_forwarded_for` — qui *ajoute* l'IP réelle derrière la valeur
envoyée par le client. Le premier élément était donc entièrement contrôlé par
l'appelant : un en-tête différent à chaque requête et le compteur repartait de
zéro indéfiniment. Vérifié à la main contre l'instance : 20 tentatives de login
échouées sans un seul 429.

Ces tests verrouillent le comportement corrigé — ils échouent si quelqu'un
revient un jour à `X-Forwarded-For[0]`.
"""

import pytest
from starlette.requests import Request

from security import get_client_ip, validate_jwt_secret, DEFAULT_JWT_SECRET


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


# ═══════════════════════════════════════════════════════════════════════════
# get_client_ip
# ═══════════════════════════════════════════════════════════════════════════

def test_x_real_ip_wins_behind_trusted_proxy():
    """nginx écrase toujours X-Real-IP : c'est la source qui fait foi."""
    request = make_request("172.18.0.2", {"X-Real-IP": "203.0.113.7"})
    assert get_client_ip(request) == "203.0.113.7"


def test_spoofed_forwarded_for_prefix_is_ignored():
    """Le cœur de la faille : le client préfixe X-Forwarded-For de ce qu'il veut.

    nginx laisse sa valeur en tête et ajoute l'IP réelle en dernier. On doit
    donc lire le DERNIER élément, jamais le premier.
    """
    request = make_request(
        "172.18.0.2",
        {"X-Forwarded-For": "198.51.100.99, 203.0.113.7"},
    )
    assert get_client_ip(request) == "203.0.113.7"


def test_real_ip_wins_over_forwarded_for():
    request = make_request("172.18.0.2", {
        "X-Real-IP": "203.0.113.7",
        "X-Forwarded-For": "198.51.100.99, 203.0.113.7",
    })
    assert get_client_ip(request) == "203.0.113.7"


def test_headers_ignored_when_peer_is_not_a_trusted_proxy():
    """Sans reverse proxy devant, aucun en-tête n'est digne de confiance.

    NB : le pair doit être une IP réellement publique. `ipaddress.is_private`
    couvre aussi les plages de documentation (192.0.2.0/24, 198.51.100.0/24,
    203.0.113.0/24), qui seraient donc considérées comme un proxy de confiance.
    """
    request = make_request("8.8.8.8", {
        "X-Real-IP": "10.0.0.1",
        "X-Forwarded-For": "10.0.0.2",
    })
    assert get_client_ip(request) == "8.8.8.8"


def test_falls_back_to_peer_without_headers():
    request = make_request("172.18.0.2")
    assert get_client_ip(request) == "172.18.0.2"


# ═══════════════════════════════════════════════════════════════════════════
# Rate limiter : le contournement démontré ne doit plus fonctionner
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def proxied_client(monkeypatch):
    """TestClient simulant une requête arrivant par nginx.

    Le TestClient de cette version de Starlette ne permet pas de choisir le pair
    TCP (pas de paramètre `client`, il vaut toujours "testclient", qui n'est
    même pas une IP valide). On force donc le pair à être considéré comme un
    proxy de confiance, pour exercer le chemin où les en-têtes sont lus — le
    comportement de `_is_trusted_peer` lui-même est couvert par les tests
    unitaires ci-dessus.
    """
    import security
    monkeypatch.setattr(security, "_is_trusted_peer", lambda host: True)

    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        yield c


def test_rotating_forwarded_for_no_longer_bypasses_rate_limiting(proxied_client):
    """20 échecs avec un X-Forwarded-For différent à chaque fois → doit finir en 429.

    C'est exactement le scénario reproduit à la main sur l'instance avant
    correctif, où les 20 tentatives renvoyaient 401 sans jamais verrouiller.
    """
    proxied_client.post("/api/auth/register", json={
        "username": "victime", "display_name": "victime",
        "password": "Password123", "password_confirm": "Password123",
    })

    statuses = []
    for i in range(1, 21):
        res = proxied_client.post(
            "/api/auth/login",
            json={"username": "victime", "password": "mauvais"},
            # L'attaquant fait varier sa partie ; nginx ajoute la vraie IP en fin.
            headers={"X-Forwarded-For": f"198.51.100.{i}, 203.0.113.7"},
        )
        statuses.append(res.status_code)

    assert 429 in statuses, "le rate limiter est de nouveau contournable via X-Forwarded-For"


def test_distinct_real_clients_are_still_limited_independently(proxied_client):
    """Le verrouillage d'une IP ne doit pas retomber sur les autres utilisateurs."""
    proxied_client.post("/api/auth/register", json={
        "username": "victime", "display_name": "victime",
        "password": "Password123", "password_confirm": "Password123",
    })

    for _ in range(6):
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
        json={"username": "victime", "password": "Password123"},
        headers={"X-Real-IP": "203.0.113.8"},
    )
    assert other.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# JWT_SECRET
# ═══════════════════════════════════════════════════════════════════════════

def test_default_jwt_secret_refuses_to_start(monkeypatch):
    """La valeur par défaut est publique (dépôt ouvert) : démarrer avec elle
    permettrait de forger un token admin sans mot de passe."""
    import security
    monkeypatch.setattr(security, "JWT_SECRET", DEFAULT_JWT_SECRET)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_jwt_secret()


def test_empty_jwt_secret_refuses_to_start(monkeypatch):
    import security
    monkeypatch.setattr(security, "JWT_SECRET", "")
    with pytest.raises(RuntimeError):
        validate_jwt_secret()


def test_env_example_placeholder_refuses_to_start(monkeypatch):
    """Copier .env.example sans le remplir ne doit pas donner une instance qui démarre."""
    import security
    monkeypatch.setattr(security, "JWT_SECRET", "changez-moi-en-production")
    with pytest.raises(RuntimeError):
        validate_jwt_secret()


def test_configured_jwt_secret_starts(monkeypatch):
    import security
    monkeypatch.setattr(security, "JWT_SECRET", "x" * 48)
    validate_jwt_secret()


def test_short_secret_warns_but_starts(monkeypatch, caplog):
    import security
    monkeypatch.setattr(security, "JWT_SECRET", "trop-court")
    with caplog.at_level("WARNING"):
        validate_jwt_secret()
    assert any("JWT_SECRET" in record.message for record in caplog.records)
