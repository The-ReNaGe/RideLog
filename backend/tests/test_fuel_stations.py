"""
Tests de non-régression sur les endpoints stations essence.

Ces routes n'exposent aucune donnée confidentielle, mais /search déclenche des
appels sortants vers Nominatim, Overpass et prix-carburants. Ouvertes, elles
faisaient de l'instance un relais gratuit vers ces services sous SON adresse
IP : n'importe qui pouvait faire bannir l'instance, et la fonctionnalité
cessait alors de marcher pour les utilisateurs légitimes.

On verrouille ici les trois garde-fous : authentification, bornes sur les
paramètres qui dimensionnent la requête sortante, et cache des résultats.
"""

import pytest

from routes import fuel_stations


def _register(client, username="conducteur", password="Password123"):
    return client.post("/api/auth/register", json={
        "username": username, "display_name": username,
        "password": password, "password_confirm": password,
    })


@pytest.fixture()
def token(client):
    _register(client)
    res = client.post("/api/auth/login", json={"username": "conducteur", "password": "Password123"})
    return res.json()["access_token"]


@pytest.fixture(autouse=True)
def clear_search_cache():
    """_search_cache est un dict module-level : sans reset, le résultat mis en
    cache par un test répond à la place de l'appel du suivant."""
    fuel_stations._search_cache.clear()
    yield
    fuel_stations._search_cache.clear()


# ═══════════════════════════════════════════════════════════════════════════
# Authentification
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("path", [
    "/api/fuel-stations/search?city=Rennes",
    "/api/fuel-stations/city-suggestions?q=Ren",
    "/api/fuel-stations/fuel-types",
])
def test_endpoints_require_authentication(client, path):
    assert client.get(path).status_code in (401, 403)


def test_authenticated_user_reaches_local_endpoints(client, token):
    """Les deux routes purement locales doivent rester utilisables — c'est la
    preuve que la dépendance ajoutée sur le routeur ne casse pas l'interface."""
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/fuel-stations/fuel-types", headers=headers).status_code == 200
    res = client.get("/api/fuel-stations/city-suggestions?q=Rennes", headers=headers)
    assert res.status_code == 200
    assert "suggestions" in res.json()


# ═══════════════════════════════════════════════════════════════════════════
# Bornes des paramètres
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("query", [
    "city=Rennes&max_distance=5000",   # rayon Overpass démesuré
    "city=Rennes&max_distance=0",
    "city=Rennes&limit=100000",
    "city=R",                          # trop court pour un nom de commune
])
def test_out_of_range_parameters_are_rejected(client, token, query):
    res = client.get(f"/api/fuel-stations/search?{query}",
                     headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════
# Cache
# ═══════════════════════════════════════════════════════════════════════════

def test_search_is_served_from_cache_on_second_call(client, token, monkeypatch):
    """Deuxième appel identique → aucun nouvel aller-retour réseau."""
    calls = []

    async def fake_coords(city):
        calls.append(city)
        return 48.11, -1.68

    async def fake_prices(lat, lon, radius_m=20000):
        return []

    async def fake_osm(lat, lon, radius=20000):
        return []

    monkeypatch.setattr(fuel_stations, "get_city_coordinates", fake_coords)
    monkeypatch.setattr(fuel_stations, "get_fuel_stations_with_prices", fake_prices)
    monkeypatch.setattr(fuel_stations, "get_fuel_stations_from_osm", fake_osm)

    headers = {"Authorization": f"Bearer {token}"}
    first = client.get("/api/fuel-stations/search?city=Rennes", headers=headers)
    second = client.get("/api/fuel-stations/search?city=Rennes", headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(calls) == 1, "le second appel est ressorti sur le réseau malgré le cache"


def test_cache_key_distinguishes_cities_but_ignores_accents_and_case(client, token, monkeypatch):
    seen = []

    async def fake_coords(city):
        seen.append(city)
        return 48.11, -1.68

    monkeypatch.setattr(fuel_stations, "get_city_coordinates", fake_coords)
    monkeypatch.setattr(fuel_stations, "get_fuel_stations_with_prices",
                        lambda *a, **k: _empty())
    monkeypatch.setattr(fuel_stations, "get_fuel_stations_from_osm",
                        lambda *a, **k: _empty())

    headers = {"Authorization": f"Bearer {token}"}
    client.get("/api/fuel-stations/search?city=Pont-Péan", headers=headers)
    client.get("/api/fuel-stations/search?city=pont pean", headers=headers)  # même clé
    client.get("/api/fuel-stations/search?city=Rennes", headers=headers)     # clé distincte

    assert len(seen) == 2


async def _empty():
    return []


def test_cache_is_capped(client, token, monkeypatch):
    """Le cache est indexé par ville : sans plafond il grossit sans limite."""
    monkeypatch.setattr(fuel_stations, "_SEARCH_CACHE_MAX_ENTRIES", 3)
    for i in range(10):
        fuel_stations._search_cache_put((f"ville{i}",), {"stations": []})
    assert len(fuel_stations._search_cache) <= 3


def test_expired_entries_are_not_served(monkeypatch):
    monkeypatch.setattr(fuel_stations, "_SEARCH_CACHE_TTL", 0)
    fuel_stations._search_cache_put(("rennes",), {"stations": []})
    assert fuel_stations._search_cache_get(("rennes",)) is None
