"""
Configuration pytest partagée.

IMPORTANT : la base de données de test doit être fixée AVANT le premier import
d'un module du projet (models.py crée son moteur SQLAlchemy au moment de son
propre import, sur la valeur de DATABASE_URL à cet instant précis). Tout ce
bloc doit donc rester en tête de fichier, avant les imports de fixtures.
"""

import os
import sys
import tempfile
import atexit
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_test_db_fd, _test_db_path = tempfile.mkstemp(suffix=".db", prefix="ridelog_test_")
os.close(_test_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("HA_INIT_KEY", "test-ha-init-key")
os.environ.setdefault("REMINDER_ENABLED", "false")


@atexit.register
def _cleanup_test_db():
    try:
        os.remove(_test_db_path)
    except OSError:
        pass


import pytest


@pytest.fixture(autouse=True)
def clean_db():
    """Base vierge avant chaque test — isolation totale entre tests."""
    from models import Base, engine
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def clean_login_limiter():
    """login_limiter est un singleton module-level (security.py) — sans reset,
    les échecs de login d'un test polluent le suivant (TestClient utilise
    toujours la même IP factice "testclient")."""
    from security import login_limiter
    login_limiter.reset()
    yield
    login_limiter.reset()


@pytest.fixture(autouse=True)
def reset_module_level_flags():
    """_ha_integration_enabled et _password_reset_enabled (routes/auth.py)
    sont des booléens module-level, pas des colonnes DB — clean_db ne les
    touche pas. Sans ce reset, un test qui désactive un flag le laisse
    désactivé pour tous les tests suivants de la session."""
    from routes import auth as auth_routes
    auth_routes._ha_integration_enabled = True
    auth_routes._password_reset_enabled = True
    yield
    auth_routes._ha_integration_enabled = True
    auth_routes._password_reset_enabled = True


@pytest.fixture()
def db_session():
    """Session SQLAlchemy directe, pour les tests qui manipulent les modèles sans passer par l'API."""
    from models import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """TestClient FastAPI — déclenche le lifespan (init_db, scheduler) sur la DB de test."""
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        yield c
