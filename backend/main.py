import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from models import init_db, SessionLocal
from routes import vehicles, maintenances, exports, webhooks, fuels, fuel_stations, auth, dashboard, families, regions
from reminder_scheduler import scheduler_loop
from security import validate_jwt_secret

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ridelog")


# ---------------------------------------------------------------------------
# Application lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Avant toute chose : refuser de démarrer sur un JWT_SECRET par défaut,
    # qui laisserait n'importe qui forger un token admin (voir security.py).
    validate_jwt_secret()

    logger.info("RideLog starting – initialising database …")
    init_db()
    logger.info("Database ready.")
    
    # Start background reminder scheduler
    task = asyncio.create_task(scheduler_loop())
    yield
    task.cancel()
    logger.info("RideLog shutting down.")


app = FastAPI(
    title="RideLog API",
    description="Application HomeLab de suivi d'entretien véhicules (voitures & motos)",
    version="2.4.0",  # x-release-please-version
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Défaut volontairement vide : le SPA est servi par nginx sur la même origine
# que l'API (/api), il n'a donc besoin d'aucun en-tête CORS. L'ancien défaut
# "*" autorisait n'importe quel site à appeler les endpoints publics et à lire
# les réponses. Home Assistant n'est pas concerné : ses appels sont serveur à
# serveur, le CORS ne s'applique qu'aux navigateurs.
# À renseigner uniquement pour un front servi depuis une autre origine
# (ex. serveur de dev Vite) : CORS_ORIGINS=http://localhost:5173
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if CORS_ORIGINS:
    if "*" in CORS_ORIGINS:
        # Cas des instances installées avant ce changement : leur .env porte
        # encore CORS_ORIGINS=*, hérité de l'ancien .env.example. On n'écrase
        # pas leur configuration, mais on la signale à chaque démarrage.
        logger.warning(
            "CORS_ORIGINS=* : n'importe quel site peut appeler les endpoints "
            "publics de cette instance et lire les réponses. Le déploiement "
            "standard n'a besoin d'aucun CORS (front et API sur la même "
            "origine) : videz CORS_ORIGINS dans votre .env."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Retry-After"],
    )
    logger.info("CORS activé pour : %s", ", ".join(CORS_ORIGINS))


# ---------------------------------------------------------------------------
# Durcissement HTTP
# ---------------------------------------------------------------------------
# nginx pose déjà ces en-têtes et plafonne la taille des corps, mais le port
# 8000 du backend est publié en direct (nécessaire à Home Assistant) : une
# instance jointe sans passer par nginx n'avait donc aucune de ces protections.
MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024  # aligné sur client_max_body_size de nginx

SECURITY_HEADERS = {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "Requête trop volumineuse."},
        )

    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


# ---------------------------------------------------------------------------
# Global exception handler – never leak stack traces
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Erreur interne du serveur. Veuillez réessayer."},
    )


# ---------------------------------------------------------------------------
# Routes – all under /api prefix
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/api")
app.include_router(families.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(vehicles.router, prefix="/api")
app.include_router(maintenances.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(fuels.router, prefix="/api")
app.include_router(fuel_stations.router, prefix="/api")
app.include_router(regions.router, prefix="/api")


@app.get("/api")
def root():
    """API root / health check."""
    has_rapidapi = bool(os.getenv("RAPIDAPI_KEY"))
    has_direct = bool(os.getenv("PLATE_API_TOKEN"))
    return {
        "status": "ok",
        "service": "RideLog \u2013 Suivi d'entretien v\u00e9hicules",
        "version": "2.4.0",  # x-release-please-version
        "plate_api_configured": has_rapidapi or has_direct,
        "plate_api_provider": "rapidapi" if has_rapidapi else ("direct" if has_direct else None),
    }


@app.get("/api/vehicle-models")
def get_vehicle_models():
    """Return available vehicle brands and models for autocomplete."""
    data_path = Path(__file__).parent / "data" / "vehicle_models.json"
    if data_path.exists():
        return json.loads(data_path.read_text(encoding="utf-8"))
    return {"car": {}, "motorcycle": {}}


@app.get("/health")
def health():
    """Health check endpoint (used by Docker HEALTHCHECK)."""
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
        return {"status": "healthy", "database": "ok"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "database": "error"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
