"""
Tests d'intégration sur les routes d'authentification, via TestClient sur une
DB SQLite temporaire (voir conftest.py). C'est ici qu'on a trouvé de vrais
bugs pendant cette session (session détachée, 401 vs 400) — ces tests
verrouillent les comportements corrigés.
"""


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


# ═══════════════════════════════════════════════════════════════════════════
# register / login de base
# ═══════════════════════════════════════════════════════════════════════════

def test_first_registered_user_becomes_admin(client):
    res = register(client, "toto")
    assert res.status_code == 201
    assert res.json()["is_admin"] is True


def test_second_user_is_not_admin_by_default(client, db_session):
    register(client, "toto")
    from config import REGISTRATION_MODE
    import config as app_config
    app_config.REGISTRATION_MODE = "open"
    res = register(client, "tata")
    assert res.status_code == 201
    assert res.json()["is_admin"] is False


def test_login_wrong_password_returns_401(client):
    register(client, "toto")
    res = login(client, "toto", password="WrongPassword")
    assert res.status_code == 401


def test_login_success_returns_token(client):
    register(client, "toto")
    res = login(client, "toto")
    assert res.status_code == 200
    assert "access_token" in res.json()


# ═══════════════════════════════════════════════════════════════════════════
# Changement de mot de passe en libre-service — /auth/me/password
# ═══════════════════════════════════════════════════════════════════════════

def test_change_password_wrong_current_returns_400_not_401(client):
    """Régression : une erreur de saisie sur un endpoint déjà authentifié doit
    être un 400, pas un 401 (qui déclencherait à tort une déconnexion côté
    frontend, voir l'intercepteur axios global)."""
    register(client, "toto")
    token = login(client, "toto").json()["access_token"]

    res = client.put(
        "/api/auth/me/password",
        json={"current_password": "WrongPassword", "new_password": "NewPassword456"},
        headers=auth_headers(token),
    )
    assert res.status_code == 400


def test_change_password_wrong_current_does_not_invalidate_token(client):
    """Le token ne doit pas être invalidé par une tentative ratée."""
    register(client, "toto")
    token = login(client, "toto").json()["access_token"]

    client.put(
        "/api/auth/me/password",
        json={"current_password": "WrongPassword", "new_password": "NewPassword456"},
        headers=auth_headers(token),
    )
    res = client.get("/api/auth/me", headers=auth_headers(token))
    assert res.status_code == 200


def test_change_password_success_actually_persists(client):
    """Régression : current_user vient d'une session DB séparée déjà fermée —
    le muter directement sans re-requêter via la session locale ne persistait
    rien (le mot de passe ne changeait jamais réellement)."""
    register(client, "toto")
    token = login(client, "toto").json()["access_token"]

    res = client.put(
        "/api/auth/me/password",
        json={"current_password": "Password123", "new_password": "NewPassword456"},
        headers=auth_headers(token),
    )
    assert res.status_code == 200

    assert login(client, "toto", password="Password123").status_code == 401
    assert login(client, "toto", password="NewPassword456").status_code == 200


def test_change_password_invalidates_old_token(client):
    register(client, "toto")
    old_token = login(client, "toto").json()["access_token"]

    client.put(
        "/api/auth/me/password",
        json={"current_password": "Password123", "new_password": "NewPassword456"},
        headers=auth_headers(old_token),
    )

    res = client.get("/api/auth/me", headers=auth_headers(old_token))
    assert res.status_code == 401


def test_change_password_returns_fresh_working_token(client):
    """L'acteur qui change son propre mot de passe ne doit pas être déconnecté :
    un nouveau token valide est réémis dans la réponse."""
    register(client, "toto")
    token = login(client, "toto").json()["access_token"]

    res = client.put(
        "/api/auth/me/password",
        json={"current_password": "Password123", "new_password": "NewPassword456"},
        headers=auth_headers(token),
    )
    new_token = res.json()["access_token"]

    res = client.get("/api/auth/me", headers=auth_headers(new_token))
    assert res.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Réinitialisation par un admin — /admin/users/{id}/reset-password
# ═══════════════════════════════════════════════════════════════════════════

def _make_admin_and_user(client):
    register(client, "admin")
    admin_token = login(client, "admin").json()["access_token"]

    import config as app_config
    app_config.REGISTRATION_MODE = "open"
    register(client, "bob")
    from models import SessionLocal, User
    db = SessionLocal()
    bob = db.query(User).filter(User.username == "bob").first()
    bob_id = bob.id
    db.close()
    return admin_token, bob_id


def test_admin_reset_password_generates_password_and_forces_change(client):
    admin_token, bob_id = _make_admin_and_user(client)

    res = client.post(
        f"/api/admin/users/{bob_id}/reset-password",
        json={},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 200
    generated = res.json()["generated_password"]
    assert generated

    login_res = login(client, "bob", password=generated)
    assert login_res.status_code == 200

    me = client.get("/api/auth/me", headers=auth_headers(login_res.json()["access_token"]))
    assert me.json()["must_change_password"] is True


def test_admin_cannot_reset_own_password(client):
    """Régression réelle : un admin qui se réinitialise lui-même perd sa session
    avant d'avoir pu noter le mot de passe généré — bloqué explicitement."""
    register(client, "admin")
    admin_token = login(client, "admin").json()["access_token"]
    from models import SessionLocal, User
    db = SessionLocal()
    admin_id = db.query(User).filter(User.username == "admin").first().id
    db.close()

    res = client.post(
        f"/api/admin/users/{admin_id}/reset-password",
        json={},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 400


def test_non_admin_cannot_reset_password(client):
    admin_token, bob_id = _make_admin_and_user(client)
    bob_token = login(client, "bob").json()["access_token"]

    res = client.post(
        f"/api/admin/users/{bob_id}/reset-password",
        json={},
        headers=auth_headers(bob_token),
    )
    assert res.status_code == 403


def test_reset_password_disabled_globally_blocks_admin_too(client):
    admin_token, bob_id = _make_admin_and_user(client)

    toggle = client.put(
        "/api/admin/password-reset-status",
        json={"enabled": False},
        headers=auth_headers(admin_token),
    )
    assert toggle.status_code == 200

    res = client.post(
        f"/api/admin/users/{bob_id}/reset-password",
        json={},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# Mot de passe temporaire — must_change_password bloque tout sauf l'allowlist
# ═══════════════════════════════════════════════════════════════════════════

def test_must_change_password_blocks_other_routes(client):
    admin_token, bob_id = _make_admin_and_user(client)
    client.post(f"/api/admin/users/{bob_id}/reset-password", json={}, headers=auth_headers(admin_token))

    from models import SessionLocal, User
    db = SessionLocal()
    bob = db.query(User).filter(User.id == bob_id).first()
    db.close()

    # On récupère un token pour bob (peu importe le mot de passe généré, on le relit en base)
    from security import create_access_token
    token = create_access_token(bob.id, bob.username, password_changed_at=bob.password_changed_at).access_token

    res = client.get("/api/vehicles", headers=auth_headers(token))
    assert res.status_code == 403


def test_must_change_password_allows_me_and_password_change(client):
    admin_token, bob_id = _make_admin_and_user(client)
    reset_res = client.post(f"/api/admin/users/{bob_id}/reset-password", json={}, headers=auth_headers(admin_token))
    generated = reset_res.json()["generated_password"]

    bob_token = login(client, "bob", password=generated).json()["access_token"]

    # /auth/me doit rester accessible
    assert client.get("/api/auth/me", headers=auth_headers(bob_token)).status_code == 200

    # Changer le mot de passe doit fonctionner malgré must_change_password
    res = client.put(
        "/api/auth/me/password",
        json={"current_password": generated, "new_password": "MyOwnPassword789"},
        headers=auth_headers(bob_token),
    )
    assert res.status_code == 200

    new_token = res.json()["access_token"]
    me = client.get("/api/auth/me", headers=auth_headers(new_token))
    assert me.json()["must_change_password"] is False

    # Et l'accès normal est débloqué
    assert client.get("/api/vehicles", headers=auth_headers(new_token)).status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Demande de reset initiée par l'utilisateur — anti-énumération
# ═══════════════════════════════════════════════════════════════════════════

def test_request_password_reset_same_response_for_real_and_fake_user(client):
    register(client, "toto")

    res_real = client.post("/api/auth/request-password-reset", json={"username": "toto"})
    res_fake = client.post("/api/auth/request-password-reset", json={"username": "n-existe-pas"})

    assert res_real.status_code == res_fake.status_code == 200
    assert res_real.json() == res_fake.json()


def test_request_password_reset_only_flags_real_user(client):
    register(client, "toto")
    client.post("/api/auth/request-password-reset", json={"username": "toto"})
    client.post("/api/auth/request-password-reset", json={"username": "n-existe-pas"})

    from models import SessionLocal, User
    db = SessionLocal()
    toto = db.query(User).filter(User.username == "toto").first()
    assert toto.password_reset_requested_at is not None
    db.close()


def test_admin_reset_clears_pending_request_flag(client):
    admin_token, bob_id = _make_admin_and_user(client)
    client.post("/api/auth/request-password-reset", json={"username": "bob"})

    from models import SessionLocal, User
    db = SessionLocal()
    assert db.query(User).filter(User.id == bob_id).first().password_reset_requested_at is not None
    db.close()

    client.post(f"/api/admin/users/{bob_id}/reset-password", json={}, headers=auth_headers(admin_token))

    db = SessionLocal()
    assert db.query(User).filter(User.id == bob_id).first().password_reset_requested_at is None
    db.close()
