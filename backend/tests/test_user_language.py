"""
Préférence de langue d'interface.

Réglage **par utilisateur**, contrairement au pays qui vaut pour l'instance :
dans un groupe famille, un membre peut vouloir l'anglais et un autre le
français. Le pays décrit la machine, la langue décrit la personne — et ces
tests verrouillent surtout cette isolation, qui est la seule chose qu'un
refactor pourrait casser sans qu'on le voie.

Le second point tenu ici est la distinction `NULL` / `"fr"` : un compte qui n'a
jamais exprimé de préférence porte `None`, pas `"fr"`. Écrire `"fr"` par défaut
rendrait impossible de distinguer plus tard « veut du français » de « n'a rien
demandé » — utile le jour où l'on voudra suivre la langue du navigateur.
"""

from tests.test_auth_integration import auth_headers, login, register
from tests.test_families import open_registration  # noqa: F401 — fixture


def token_of(client, username, password="Password123"):
    return login(client, username, password).json()["access_token"]


def me(client, headers):
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_a_new_account_has_no_language_preference(client):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))

    # None, et surtout pas "fr" : personne n'a encore rien choisi.
    assert me(client, headers)["language"] is None


def test_choosing_a_language_is_remembered(client):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))

    res = client.put("/api/auth/me/language", json={"language": "en"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["language"] == "en"

    # Relu depuis le compte : c'est ce qui le fait suivre d'un navigateur à l'autre.
    assert me(client, headers)["language"] == "en"


def test_an_unsupported_language_is_refused(client):
    register(client, "alice")
    headers = auth_headers(token_of(client, "alice"))

    res = client.put("/api/auth/me/language", json={"language": "de"}, headers=headers)

    assert res.status_code == 422
    assert me(client, headers)["language"] is None


def test_the_preference_is_per_user_not_per_instance(client, open_registration):
    register(client, "alice")
    register(client, "bob")
    alice = auth_headers(token_of(client, "alice"))
    bob = auth_headers(token_of(client, "bob"))

    client.put("/api/auth/me/language", json={"language": "en"}, headers=alice)

    assert me(client, alice)["language"] == "en"
    assert me(client, bob)["language"] is None  # bob n'a rien demandé


def test_changing_the_language_requires_a_token(client):
    assert client.put("/api/auth/me/language", json={"language": "en"}).status_code in (401, 403)
