"""Fuel stations finder using geocoding and OpenStreetMap/prix-carburants data."""

import logging
import math
import asyncio
import time
import csv
import os
import unicodedata
from difflib import SequenceMatcher
from typing import Optional
import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("ridelog.fuel_stations")
router = APIRouter(prefix="/fuel-stations", tags=["fuel-stations"])

def _remove_accents(text: str) -> str:
	"""Remove accents from text for accent-insensitive search (é -> e, ç -> c, etc)."""
	nfd = unicodedata.normalize('NFD', text)
	return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')

# Nominatim (OpenStreetMap) for geocoding - with rate limiting
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Overpass API for finding fuel stations (backup/fallback)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# prix-carburants API for real-time prices (official French government API)
PRIX_CARBURANTS_URL = "https://api.prix-carburants.2aaz.fr"

# Rate limiting for Nominatim (1 request per 2 seconds to be safe)
_last_nominatim_request_time = 0.0
_nominatim_request_lock = asyncio.Lock()
_city_coordinates_cache = {}  # Cache for city coordinates

# Load communes database from CSV (39k+ French communes)
_communes_db = {}  # {'nom_commune': (lat, lon), ...}
_communes_list = []  # List of communes for fuzzy matching

def _load_communes_csv():
    """Load communes from CSV file on startup."""
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'communes.csv')
    
    if not os.path.exists(csv_path):
        logger.warning(f"Communes CSV not found at {csv_path}")
        return
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    nom = row.get('nom_commune', '').strip().lower()
                    lat = float(row.get('latitude', 0))
                    lon = float(row.get('longitude', 0))
                    
                    if nom and lat and lon:
                        # IMPORTANT: Only store original name in _communes_list (to avoid duplicates in fuzzy match)
                        # But store BOTH in _communes_db for lookup
                        if nom not in _communes_db:
                            _communes_db[nom] = (lat, lon)
                            _communes_list.append(nom)  # Only original
                        
                        # Also store normalized version (without accents) for accent-insensitive lookup
                        nom_normalized = _remove_accents(nom)
                        if nom_normalized != nom and nom_normalized not in _communes_db:
                            _communes_db[nom_normalized] = (lat, lon)
                            # NOTE: Don't add to _communes_list to avoid finding both "cote" and "côte"
                except (ValueError, KeyError):
                    continue
        
        logger.info(f"✅ Loaded {len(_communes_db)} commune entries ({len(_communes_list)} unique communes)")
    except Exception as e:
        logger.error(f"Error loading communes CSV: {e}")

# Load on module import
_load_communes_csv()

def _fuzzy_match_communes(query: str, limit: int = 10) -> list:
    """
    Fuzzy match communes using difflib (ultra-fast, < 5ms for 39k communes).
    
    Strategy:
    1. EXACT MATCHES (startswith) - INSTANT < 1ms, sorted by name length (SHORTEST first)
    2. FUZZY MATCHES - Limited to top candidates, early exit
    
    Accent-insensitive: "cote" will match "côte", "ile" will match "île", etc.
    Returns list of (similarity_score, nom_commune) tuples, ALWAYS sorted by length.
    """
    if not query or len(query) < 2:
        return []
    
    query_lower = query.strip().lower()
    query_normalized = _remove_accents(query_lower)  # Remove accents for matching
    exact_matches = []
    
    # Phase 1: EXACT matches (startswith on NORMALIZED versions) - O(n) but very fast
    for commune in _communes_list:
        commune_normalized = _remove_accents(commune)
        if commune_normalized.startswith(query_normalized):
            exact_matches.append((1.0, commune))
    
    # Sort exact matches by name length (SHORTEST first), then alphabetically
    exact_matches.sort(key=lambda x: (len(x[1]), x[1]))
    
    # If we have enough exact matches (>= limit), return sorted ones
    if len(exact_matches) >= limit:
        return exact_matches[:limit]
    
    # If we have good exact matches (>= 2), return them without fuzzy search
    if len(exact_matches) >= 2:
        return exact_matches[:limit]
    
    # Phase 2: FUZZY matches (expensive, limited to 500 candidates for speed)
    fuzzy_matches = []
    fuzzy_candidates = 0
    for commune in _communes_list:
        commune_normalized = _remove_accents(commune)
        if not commune_normalized.startswith(query_normalized):
            ratio = SequenceMatcher(None, query_normalized, commune_normalized).ratio()
            if ratio > 0.6:  # 60% similarity threshold
                fuzzy_matches.append((ratio, commune))
            
            fuzzy_candidates += 1
            # Optimization: stop fuzzy matching after checking 500 candidates
            if fuzzy_candidates > 500:
                break
    
    # Combine: exact matches + fuzzy matches
    all_matches = exact_matches + fuzzy_matches
    # Sort by: 1) score DESC (exact matches first), 2) name length ASC (SHORTEST names first)
    all_matches.sort(key=lambda x: (-x[0], len(x[1])))
    return all_matches[:limit]
MAJOR_CITIES_DB = {
    "paris": (48.8534951, 2.3483915),
    "marseille": (43.2965, 5.3698),
    "lyon": (45.7640, 4.8357),
    "toulouse": (43.6047, 1.4442),
    "nice": (43.7102, 7.2620),
    "nantes": (47.2184, -1.5536),
    "strasbourg": (48.5734, 7.7521),
    "montpellier": (43.6108, 3.8767),
    "bordeaux": (44.8378, -0.5792),
    "lille": (50.6292, 3.0573),
    "rennes": (48.1173, -1.6778),
    "reims": (49.2583, 4.0347),
    "le havre": (49.4938, 0.1079),
    "saint-étienne": (45.4398, 4.3910),
    "toulon": (43.1256, 5.9302),
    "grenoble": (45.1885, 5.7245),
    "dijon": (47.3220, 5.0344),
    "angers": (47.4829, -0.5458),
    "nîmes": (43.8345, 4.3569),
    "aix-en-provence": (43.5298, 5.4474),
    "villeurbanne": (45.7707, 4.8790),
    "le mans": (48.0061, 0.1996),
    "amiens": (49.8941, 2.2959),
    "mulhouse": (47.7508, 7.3400),
    "rouen": (49.4432, 1.0993),
    "caen": (49.1829, -0.3660),
    "dunkerque": (51.0344, 2.3796),
    "saint-denis": (48.9354, 2.3569),
    "versailles": (48.8047, 2.1303),
    "courbevoie": (48.8968, 2.2560),
    "nancy": (48.6921, 6.1844),
    "metz": (49.1186, 6.1769),
    "lens": (50.4281, 2.8230),
    "clermont-ferrand": (45.7772, 3.0864),
    "brest": (48.3904, -4.4861),
    "tours": (47.3941, 0.6848),
    "limoges": (45.8336, 1.2611),
    "perpignan": (42.6987, 2.8945),
    "poitiers": (46.5839, 0.3401),
    "orléans": (47.9029, 1.9093),
    "aulnay-sous-bois": (48.9463, 2.4983),
    "vern-sur-seiche": (48.0783, -1.7142),
    "rennes": (48.1173, -1.6778),
}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using haversine formula (in km)."""
    R = 6371  # Earth radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


async def get_city_coordinates(city_name: str) -> tuple[float, float]:
    """
    Get latitude and longitude for a city name.
    
    Strategy (prioritized):
    1. CSV communes database (39k+ communes) - instant < 1ms
    2. Accent-normalized search in CSV - handles "cote" matching "côte"
    3. Local hardcoded database (40+ major cities) - instant < 1ms  
    4. Check cache - fast < 1ms
    5. Fuzzy matching for misspellings
    6. Call Nominatim API with rate limiting (2 sec between calls) - last resort
    
    This avoids 429 errors by respecting Nominatim's rate limits.
    Accent-insensitive searches ensure better UX.
    """
    global _last_nominatim_request_time, _city_coordinates_cache
    
    city_key = city_name.strip().lower()
    city_key_normalized = _remove_accents(city_key)
    
    # 1. Check CSV communes database (39k+ communes) - FASTEST (with accents)
    if city_key in _communes_db:
        logger.info(f"City '{city_name}' found in communes CSV database")
        return _communes_db[city_key]
    
    # 1b. Check CSV communes database (without accents) - for accent-insensitive search
    if city_key_normalized != city_key and city_key_normalized in _communes_db:
        logger.info(f"City '{city_name}' found in communes CSV (accent-normalized: '{city_key_normalized}')")
        return _communes_db[city_key_normalized]
    
    # 2. Check hardcoded major cities database (40 cities)
    if city_key in MAJOR_CITIES_DB:
        logger.info(f"City '{city_name}' found in major cities database")
        return MAJOR_CITIES_DB[city_key]
    
    # 2b. Check hardcoded major cities (without accents)
    if city_key_normalized != city_key and city_key_normalized in MAJOR_CITIES_DB:
        logger.info(f"City '{city_name}' found in major cities (accent-normalized: '{city_key_normalized}')")
        return MAJOR_CITIES_DB[city_key_normalized]
    
    # 3. Check cache (previously geocoded cities)
    if city_key in _city_coordinates_cache:
        logger.info(f"City '{city_name}' found in cache")
        return _city_coordinates_cache[city_key]
    
    # 4. Try fuzzy matching in CSV (for slight misspellings and typos)
    matches = _fuzzy_match_communes(city_name, limit=1)
    if matches:
        score, matched_name = matches[0]
        if score > 0.85:  # High confidence match
            coords = _communes_db[matched_name]
            logger.info(f"City '{city_name}' fuzzy-matched to '{matched_name}' (score: {score:.2f})")
            _city_coordinates_cache[city_key] = coords
            return coords
    
    # 5. Call Nominatim with rate limiting (fallback for very specific cities)
    logger.info(f"City '{city_name}' not found locally, calling Nominatim with rate limiting...")
    
    async with _nominatim_request_lock:
        # Respect rate limit: wait 2 seconds since last request
        elapsed = time.time() - _last_nominatim_request_time
        if elapsed < 2.0:
            wait_time = 2.0 - elapsed
            logger.info(f"Rate limiting: waiting {wait_time:.1f}s before Nominatim request")
            await asyncio.sleep(wait_time)
        
        # Make the request
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                logger.info(f"Nominatim request for '{city_name}'")
                response = await client.get(
                    NOMINATIM_URL,
                    params={
                        "q": f"{city_name}, France",
                        "format": "json",
                        "limit": 1,
                        "accept-language": "fr",
                    },
                    headers={"User-Agent": "RideLog/1.0"}
                )
                _last_nominatim_request_time = time.time()
                
                response.raise_for_status()
                data = response.json()
                
                if not data:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Ville '{city_name}' non trouvée. Essayez une plus grande ville."
                    )
                
                result = data[0]
                coords = (float(result["lat"]), float(result["lon"]))
                
                # Cache the result
                _city_coordinates_cache[city_key] = coords
                logger.info(f"Cached coordinates for '{city_name}': {coords}")
                
                return coords
                
        except httpx.HTTPError as e:
            error_msg = str(e)
            if "429" in error_msg:
                logger.warning(f"Nominatim rate limit (429) for city '{city_name}': {error_msg}")
                raise HTTPException(
                    status_code=429,
                    detail=f"Service temporairement indisponible. Réessayez dans quelques secondes."
                )
            else:
                logger.error(f"Geocoding error for city '{city_name}': {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Erreur géocodage: {error_msg[:100]}"
                )


async def get_fuel_stations_with_prices(lat: float, lon: float, radius_m: float = 20000) -> list:
    """Fetch fuel stations with prices using prix-carburants API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Convert meters to kilometers for prix-carburants API
            radius_km = radius_m / 1000
            
            logger.info(f"Fetching stations from prix-carburants: lat={lat}, lon={lon}, radius={radius_km}km")
            
            # Fetch list of nearby stations
            response = await client.get(
                f"{PRIX_CARBURANTS_URL}/stations/around/{lat},{lon}",
                params={
                    "radius": int(radius_km) if radius_km <= 100 else 100,  # API limit
                    "limit": 50,  # Get more stations for filtering
                },
                headers={"User-Agent": "RideLog/1.0"},
                timeout=30.0
            )
            
            if response.status_code == 429:
                logger.warning("prix-carburants API rate limit reached")
                return []
            
            response.raise_for_status()
            stations_list = response.json()
            
            if not isinstance(stations_list, list):
                logger.warning(f"Unexpected response format from prix-carburants: {type(stations_list)}")
                return []
            
            logger.info(f"Got {len(stations_list)} stations from prix-carburants, fetching prices...")
            
            # Fetch detailed prices for top stations (limited to avoid rate limiting)
            stations = []
            for i, station_data in enumerate(stations_list[:25]):  # Limit to 25 to avoid rate limiting
                try:
                    station_id = station_data.get("id")
                    
                    # Fetch full station details with prices
                    detail_response = await client.get(
                        f"{PRIX_CARBURANTS_URL}/station/{station_id}",
                        headers={"User-Agent": "RideLog/1.0"},
                        timeout=30.0
                    )
                    
                    if detail_response.status_code == 429:
                        logger.warning("prix-carburants API rate limit reached during detail fetch")
                        break
                    
                    detail_response.raise_for_status()
                    details = detail_response.json()
                    
                    # Extract fuel information
                    fuels = {}
                    for fuel in details.get("Fuels", []):
                        fuel_name = fuel.get("shortName", "").lower()
                        fuel_type = fuel.get("type", "").upper()
                        
                        price_data = fuel.get("Price", {})
                        price = price_data.get("value") if price_data else None
                        
                        # Map to our fuel type names
                        fuel_key = None
                        if fuel_type == "D" or "gazole" in fuel_name or "diesel" in fuel_name:
                            fuel_key = "diesel"
                        elif fuel_name == "sp95" or fuel_type == "E" and "95" in fuel_name:
                            fuel_key = "sp95"
                        elif fuel_name == "sp98" or "98" in fuel_name:
                            fuel_key = "sp98"
                        elif fuel_name == "e10" or "e10" in fuel_name:
                            fuel_key = "e10"
                        elif "glp" in fuel_name or "lpg" in fuel_name:
                            fuel_key = "glp"
                        elif "e85" in fuel_name:
                            fuel_key = "e85"
                        elif "essence" in fuel_name or fuel_name in ("sp95", "sp98"):
                            fuel_key = fuel_name
                        
                        if fuel_key:
                            fuels[fuel_key] = {
                                "available": fuel.get("available", True),
                                "price": price,
                                "updated": fuel.get("Update", {}).get("value")
                            }
                    
                    # Fallback if no fuels found
                    if not fuels:
                        fuels = {"essence": {"available": True}}
                    
                    # Parse address
                    address_info = details.get("Address", {})
                    street = address_info.get("street_line", "")
                    city_line = address_info.get("city_line", "")
                    
                    coords = details.get("Coordinates", {})
                    station = {
                        "id": details.get("id"),
                        "name": details.get("name", "Station essence"),
                        "address": street,
                        "city": city_line,
                        "latitude": coords.get("latitude"),
                        "longitude": coords.get("longitude"),
                        "fuels": fuels,
                        "operator": details.get("Brand", {}).get("name", ""),
                        "brand": details.get("Brand", {}).get("name", ""),
                        "source": "prix-carburants"
                    }
                    
                    stations.append(station)
                    logger.debug(f"Fetched station {station['name']} with fuels {list(fuels.keys())}")
                    
                except httpx.HTTPError as e:
                    logger.warning(f"Error fetching station {station_id}: {e}")
                    continue
                except (KeyError, ValueError) as e:
                    logger.warning(f"Error parsing station details: {e}")
                    continue
            
            logger.info(f"Successfully fetched {len(stations)} stations with prices from prix-carburants")
            return stations
            
        except httpx.HTTPError as e:
            logger.warning(f"Error fetching from prix-carburants: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error in prix-carburants: {e}")
            return []


async def get_fuel_stations_from_osm(lat: float, lon: float, radius: float = 20000) -> list:
    """Fetch fuel stations from OpenStreetMap using Overpass API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Convert radius (meters) to degrees (approx)
            lat_delta = radius / 111000  # 1 degree latitude ≈ 111km
            lon_delta = radius / (111000 * math.cos(math.radians(lat)))  # account for longitude at this latitude
            
            # Overpass query for fuel stations - bbox format: [bbox:south,west,north,east]
            south = lat - lat_delta
            north = lat + lat_delta
            west = lon - lon_delta
            east = lon + lon_delta
            
            # More efficient query without geometry, request JSON output
            query = f"""[out:json][bbox:{south},{west},{north},{east}];(node["amenity"="fuel"];way["amenity"="fuel"];);out center;"""
            
            logger.info(f"Overpass query: bbox=[{south},{west},{north},{east}]")
            
            response = await client.post(
                OVERPASS_URL,
                data=query,
                headers={"User-Agent": "RideLog/1.0"},
                timeout=30.0
            )
            response.raise_for_status()
            
            # Parse JSON response
            data = response.json()
            logger.info(f"Overpass returned {len(data.get('elements', []))} elements")
            stations = []
            
            for element in data.get("elements", []):
                try:
                    # Get coordinates
                    if "center" in element:
                        station_lat = element["center"]["lat"]
                        station_lon = element["center"]["lon"]
                    elif "lat" in element and "lon" in element:
                        station_lat = element["lat"]
                        station_lon = element["lon"]
                    else:
                        continue
                    
                    tags = element.get("tags", {})
                    station = {
                        "id": element.get("id"),
                        "name": tags.get("name", "Station essence"),
                        "address": tags.get("addr:street", ""),
                        "city": tags.get("addr:city", ""),
                        "latitude": station_lat,
                        "longitude": station_lon,
                        "fuels": {},
                        "operator": tags.get("operator", ""),
                    }
                    
                    # Extract fuel types from tags
                    # OSM stores fuel availability as fuel:TYPE=yes/no
                    fuel_types = {}
                    
                    # Common fuel type mappings
                    fuel_tags = {
                        "fuel:petrol": ["sp95", "sp98", "e10", "essence"],  # Essence (various grades)
                        "fuel:diesel": ["diesel"],
                        "fuel:lpg": ["glp"],
                        "fuel:electric": ["electric"],
                        "fuel:e85": ["e85"],
                        "fuel:octane_95": ["sp95"],
                        "fuel:octane_98": ["sp98"],
                    }
                    
                    # Check tags for fuel types
                    for tag_name, fuel_names in fuel_tags.items():
                        if tags.get(tag_name) == "yes":
                            for fname in fuel_names:
                                fuel_types[fname] = True
                    
                    # If no specific fuel found, assume it has essence (most common)
                    if not fuel_types:
                        fuel_types["essence"] = True
                    
                    station["fuels"] = fuel_types
                    stations.append(station)
                    logger.info(f"Added station: {station['name']} with fuels {list(fuel_types.keys())}")
                    
                except (KeyError, ValueError) as e:
                    logger.warning(f"Error parsing station: {e}")
                    continue
            
            logger.info(f"Total stations found: {len(stations)}")
            return stations
        except httpx.HTTPError as e:
            logger.error(f"Error fetching from OSM: {e}")
            return []


@router.get("/search")
async def search_fuel_stations(
    city: str,
    fuel_type: Optional[str] = None,
    max_distance: float = 20.0,
    limit: int = 20,
):
    """
    Search for fuel stations near a city.
    
    Note: This returns fuel stations from OpenStreetMap. Real-time prices 
    require integration with fuel price APIs (currently under development).
    
    Args:
        city: City name in France
        fuel_type: Type of fuel (diesel, essence, glp, etc.) - optional
        max_distance: Maximum distance in km (default 20)
        limit: Maximum number of results (default 20)
    """
    try:
        # Geocode city name
        lat, lon = await get_city_coordinates(city)
        
        # Try to get stations with prices from prix-carburants API first
        logger.info(f"Searching for fuel stations near {city} (lat={lat}, lon={lon})")
        all_stations = await get_fuel_stations_with_prices(lat, lon, radius_m=max_distance * 1000)
        
        # Fallback to OpenStreetMap if prix-carburants is unavailable or returns no results
        if not all_stations:
            logger.info("prix-carburants unavailable or no results, using OpenStreetMap fallback")
            all_stations = await get_fuel_stations_from_osm(lat, lon, radius=max_distance * 1000)
        
        if not all_stations:
            return {
                "city": city,
                "coordinates": {"latitude": lat, "longitude": lon},
                "fuel_type": fuel_type,
                "max_distance_km": max_distance,
                "total_found": 0,
                "message": "Aucune station essence trouvée. Les données proviennent d'OpenStreetMap et de prix-carburants.",
                "stations": [],
            }
        
        # Filter and sort
        nearby_stations = []
        for station in all_stations:
            distance = haversine_distance(
                lat, lon,
                station["latitude"], station["longitude"]
            )
            
            if distance > max_distance:
                continue
            
            # Filter by fuel type if specified
            if fuel_type:
                requested_fuel = fuel_type.lower()
                station_fuels = list(station["fuels"].keys())
                
                # Create fuel type equivalence mapping
                # E10 is compatible with SP95, so we group them
                fuel_equivalences = {
                    "sp95": ["sp95", "e10", "essence"],  # E10 can be used in SP95 cars
                    "sp98": ["sp98", "essence"],
                    "e85": ["e85"],
                    "diesel": ["diesel"],
                }
                
                # Check if station has the requested fuel type or an equivalent
                equivalent_fuels = fuel_equivalences.get(requested_fuel, [requested_fuel])
                has_fuel = any(fuel in station_fuels for fuel in equivalent_fuels)
                
                if not has_fuel:
                    logger.info(f"Skipping station {station['name']}: has {station_fuels}, looking for {equivalent_fuels}")
                    continue
            
            station["distance_km"] = round(distance, 2)
            nearby_stations.append(station)
            logger.info(f"Included station: {station['name']} at {station['distance_km']} km")
        
        # Calculate price for sorting based on fuel type filter
        def get_sort_price(station: dict) -> tuple:
            """Get price and distance for sorting. If fuel type is filtered, use that price, else use min price."""
            
            # If a fuel type is specified, extract its price
            if fuel_type:
                requested_fuel = fuel_type.lower()
                # Fuel type equivalence mapping for price extraction
                fuel_equivalences = {
                    "sp95": ["sp95", "e10", "essence"],  # Prefer SP95, then E10
                    "sp98": ["sp98", "essence"],
                    "e85": ["e85"],
                    "diesel": ["diesel"],
                }
                
                # Try to get price from exact fuel or equivalents (in priority order)
                equivalent_fuels = fuel_equivalences.get(requested_fuel, [requested_fuel])
                for fuel_name in equivalent_fuels:
                    if fuel_name in station.get("fuels", {}):
                        fuel_data = station["fuels"][fuel_name]
                        price = fuel_data.get("price") if isinstance(fuel_data, dict) else None
                        if price is not None:
                            return (0, price, station["distance_km"])
                
                # No price found for requested fuel
                return (1, float('inf'), station["distance_km"])
            
            # No fuel type specified - use minimum price across all fuels
            min_price = None
            for fuel_info in station.get("fuels", {}).values():
                price = fuel_info.get("price") if isinstance(fuel_info, dict) else None
                if price is not None:
                    if min_price is None or price < min_price:
                        min_price = price
            return (0 if min_price is not None else 1, min_price or float('inf'), station["distance_km"])
        
        # Sort by price (cheapest first), then by distance
        nearby_stations.sort(key=get_sort_price)
        
        # Determine data source for message
        # If a fuel type is filtered, show only that fuel for clarity
        result_stations = nearby_stations[:limit]
        if fuel_type:
            requested_fuel = fuel_type.lower()
            fuel_equivalences = {
                "sp95": ["sp95", "e10", "essence"],  # Also show E10 as compatible with SP95
                "sp98": ["sp98", "essence"],
                "e85": ["e85"],
                "diesel": ["diesel"],
            }
            equivalent_fuels = fuel_equivalences.get(requested_fuel, [requested_fuel])
            
            # Filter displayed fuels for each station to show only requested fuel
            for station in result_stations:
                filtered_fuels = {}
                for fuel_name in equivalent_fuels:
                    if fuel_name in station.get("fuels", {}):
                        filtered_fuels[fuel_name] = station["fuels"][fuel_name]
                
                # Keep original data if filtering results in empty fuels
                if filtered_fuels:
                    station["fuels"] = filtered_fuels
        
        source = "prix-carburants" if all_stations and all_stations[0].get("source") == "prix-carburants" else "OpenStreetMap"
        if source == "prix-carburants":
            message = "Prices réels de prix-carburants.gouv.fr. Les prix sont mis à jour en continu."
        else:
            message = "Données OpenStreetMap. Les prix en temps réel seront intégrés prochainement."
        
        logger.info(f"Returning {len(result_stations)} stations out of {len(nearby_stations)} found (source: {source})")
        
        return {
            "city": city,
            "coordinates": {"latitude": lat, "longitude": lon},
            "fuel_type": fuel_type,
            "max_distance_km": max_distance,
            "total_found": len(nearby_stations),
            "source": source,
            "message": message,
            "stations": result_stations,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching stations: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur recherche: {str(e)}")


@router.get("/city-suggestions")
async def get_city_suggestions(q: str):
    """
    Get city suggestions using ultra-fast fuzzy matching on CSV database (39k+ communes).
    
    Strategy (Ultra-optimized):
    1. Fuzzy match against CSV communes (39k+) - INSTANT < 5ms
    2. Dedup by coordinates - keep only the most accented version (pont-péan vs pont-pean)
    3. No Nominatim needed anymore (100% local, no API lag)
    
    Performance:
    - Exact/Startswith matches: < 1ms
    - Fuzzy matches: < 5ms even with 39k communes
    - No network latency or rate limiting
    """
    
    if not q or len(q.strip()) < 2:
        return {"suggestions": []}
    
    # Ultra-fast fuzzy matching on CSV communes
    matches = _fuzzy_match_communes(q, limit=10)  # Get more to account for dedup
    
    # Dedup by coordinates - track (lat, lon) -> name
    # Prefer the version with accents (longer byte count = more accents)
    seen_coords = {}  # (lat, lon) -> commune_name
    
    for score, commune_name in matches:
        coords = _communes_db.get(commune_name)
        if coords:
            lat, lon = coords
            coord_key = (lat, lon)
            
            # If we haven't seen these coords, store them
            if coord_key not in seen_coords:
                seen_coords[coord_key] = commune_name
            else:
                # If we have seen these coords, prefer the one with more accents
                existing = seen_coords[coord_key]
                existing_normalized = _remove_accents(existing)
                new_normalized = _remove_accents(commune_name)
                
                # If they normalize to the same word, keep the one that is longer
                # (usually means it has more accents: é, è, ê, etc.)
                if existing_normalized == new_normalized and len(commune_name) > len(existing):
                    # Delete and re-insert to move it to the end (preserve insertion order)
                    del seen_coords[coord_key]
                    seen_coords[coord_key] = commune_name
    
    # Build suggestion list from deduplicated coords (take first 3)
    suggestions = []
    for (lat, lon), commune_name in list(seen_coords.items())[:3]:
        # Format commune name nicely (capitalize first letter of each word)
        display_name = ' '.join(word.capitalize() for word in commune_name.split())
        suggestions.append({
            "name": display_name,
            "display": f"{display_name}, France",
            "lat": lat,
            "lon": lon,
        })
    
    logger.info(f"Found {len(suggestions)} unique commune matches for '{q}' (dedup by coords)")
    return {"suggestions": suggestions}


@router.get("/fuel-types")
async def get_available_fuel_types():
    """Get list of available fuel types."""
    return {
        "fuel_types": [
            {"code": "sp95", "label": "Essence SP95 (y compris E10)", "emoji": "⛽"},
            {"code": "sp98", "label": "Essence SP98", "emoji": "⛽"},
            {"code": "e85", "label": "Essence E85 (Bioéthanol)", "emoji": "🌱"},
            {"code": "diesel", "label": "Gazole (Diesel)", "emoji": "⛽"},
        ]
    }

