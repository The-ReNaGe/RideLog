"""
Canaux de notification : Discord et ntfy.

Aucun test ne sort sur le réseau — `httpx.AsyncClient` est remplacé par un
enregistreur qui retient la requête et rend le statut qu'on lui demande.
C'est la requête construite qu'on vérifie : URL, corps, en-têtes.
"""

import httpx
import pytest

import routes.webhooks as webhooks_module
from routes.webhooks import _split_ntfy_url


def _account(client, username="conducteur"):
    client.post("/api/auth/register", json={
        "username": username, "display_name": username,
        "password": "Password123", "password_confirm": "Password123",
    })
    token = client.post("/api/auth/login", json={
        "username": username, "password": "Password123",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def headers(client):
    return _account(client)


@pytest.fixture()
def outbox(monkeypatch):
    """Capture les POST sortants ; `outbox.status` règle la réponse rendue."""
    sent = []

    class _Recorder:
        status = 200

        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            sent.append({"url": url, "json": json, "headers": headers or {}})
            request = httpx.Request("POST", url)
            return httpx.Response(_Recorder.status, request=request)

    monkeypatch.setattr(webhooks_module.httpx, "AsyncClient", _Recorder)
    _Recorder.sent = sent
    return _Recorder


# ── Découpage de l'URL ntfy ──────────────────────────────────────────────


@pytest.mark.parametrize("url, base, topic", [
    ("https://ntfy.sh/ridelog", "https://ntfy.sh", "ridelog"),
    ("https://ntfy.sh/ridelog/", "https://ntfy.sh", "ridelog"),
    ("http://ntfy:80/alertes-moto", "http://ntfy:80", "alertes-moto"),
    # Serveur servi sous un sous-chemin : le chemin reste dans la base.
    ("https://home.example/ntfy/garage", "https://home.example/ntfy", "garage"),
])
def test_the_ntfy_url_splits_into_server_and_topic(url, base, topic):
    assert _split_ntfy_url(url) == (base, topic)


@pytest.mark.parametrize("url", ["https://ntfy.sh", "https://ntfy.sh/", "ntfy.sh/ridelog", "ftp://x/y"])
def test_an_ntfy_url_without_a_topic_is_refused(url):
    with pytest.raises(Exception):
        _split_ntfy_url(url)


# ── Création ─────────────────────────────────────────────────────────────


def test_an_ntfy_channel_can_be_created(client, headers):
    res = client.post("/api/settings/webhooks", headers=headers, json={
        "webhook_type": "ntfy", "url": "https://ntfy.sh/ridelog-test",
    })
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["webhook_type"] == "ntfy"
    assert body["has_auth_token"] is False


def test_an_ntfy_url_without_a_topic_is_refused_at_creation(client, headers):
    """L'erreur doit tomber à la saisie, pas au premier rappel des semaines
    plus tard dans un log que personne ne lit."""
    res = client.post("/api/settings/webhooks", headers=headers, json={
        "webhook_type": "ntfy", "url": "https://ntfy.sh/",
    })
    assert res.status_code == 400


def test_the_access_token_is_stored_but_never_returned(client, headers):
    res = client.post("/api/settings/webhooks", headers=headers, json={
        "webhook_type": "ntfy", "url": "https://ntfy.sh/prive", "auth_token": "tk_secret",
    })
    assert res.status_code == 201
    assert res.json()["has_auth_token"] is True
    assert "tk_secret" not in res.text

    listed = client.get("/api/settings/webhooks", headers=headers)
    assert "tk_secret" not in listed.text
    assert listed.json()[0]["has_auth_token"] is True


def test_an_unknown_channel_type_is_refused(client, headers):
    res = client.post("/api/settings/webhooks", headers=headers, json={
        "webhook_type": "gotify", "url": "https://gotify.example/message",
    })
    assert res.status_code == 422


# ── Envoi ────────────────────────────────────────────────────────────────


def _create(client, headers, **fields):
    res = client.post("/api/settings/webhooks", headers=headers, json=fields)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_ntfy_is_published_through_the_json_api_at_the_server_root(client, headers, outbox):
    """Publier à la racine, en JSON, et non en POST sur l'URL du sujet : le
    titre passerait sinon dans un en-tête HTTP, où « Révision » ne voyage
    pas sans encodage RFC 2047."""
    wid = _create(client, headers, webhook_type="ntfy",
                  url="https://ntfy.sh/ridelog-test", auth_token="tk_abc")

    res = client.post(f"/api/settings/webhooks/{wid}/test", headers=headers)
    assert res.status_code == 200, res.text

    [req] = outbox.sent
    assert req["url"] == "https://ntfy.sh"
    assert req["json"]["topic"] == "ridelog-test"
    assert req["json"]["title"].startswith("[RideLog]")
    assert "Vidange d'huile" in req["json"]["message"]
    assert req["json"]["priority"] == 3
    assert req["headers"]["Authorization"] == "Bearer tk_abc"


def test_ntfy_without_a_token_sends_no_authorization_header(client, headers, outbox):
    wid = _create(client, headers, webhook_type="ntfy", url="https://ntfy.sh/ouvert")
    client.post(f"/api/settings/webhooks/{wid}/test", headers=headers)
    assert "Authorization" not in outbox.sent[0]["headers"]


def test_discord_still_receives_an_embed(client, headers, outbox):
    wid = _create(client, headers, webhook_type="discord",
                  url="https://discord.com/api/webhooks/1/abc")
    client.post(f"/api/settings/webhooks/{wid}/test", headers=headers)

    [req] = outbox.sent
    assert req["url"] == "https://discord.com/api/webhooks/1/abc"
    assert "embeds" in req["json"]
    assert req["headers"] == {}


def test_a_rejected_delivery_is_reported_as_a_failure(client, headers, outbox):
    """Un webhook Discord supprimé (404) ou un sujet ntfy protégé (403)
    comptaient comme « envoyé » : le bouton Tester disait « succès » et les
    rappels partaient dans le vide."""
    wid = _create(client, headers, webhook_type="ntfy", url="https://ntfy.sh/prive")
    outbox.status = 403

    res = client.post(f"/api/settings/webhooks/{wid}/test", headers=headers)
    assert res.status_code == 502
    assert "403" in res.json()["detail"]
    assert "mozilla" not in res.json()["detail"]


def test_ntfy_priority_follows_the_reminder_tier(client, headers, outbox, db_session):
    """En retard = alarme (5), premier rappel = notification ordinaire (3)."""
    from models import Webhook
    from routes.webhooks import _ntfy_request

    webhook = Webhook(user_id=1, url="https://ntfy.sh/t", webhook_type="ntfy", token_secret="x")
    _, overdue, _ = _ntfy_request(webhook, "t", "m", "overdue")
    _, warning, _ = _ntfy_request(webhook, "t", "m", "warning")
    assert overdue["priority"] == 5
    assert warning["priority"] == 3
    assert overdue["tags"] == ["rotating_light"]
