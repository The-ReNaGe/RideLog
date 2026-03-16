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
from routes import vehicles, maintenances, exports, webhooks, fuels, fuel_stations, auth, dashboard
from reminder_scheduler import scheduler_loop

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
    version="1.3.0",
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS – restrict in production via CORS_ORIGINS env var
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)


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
app.include_router(dashboard.router, prefix="/api")
app.include_router(vehicles.router, prefix="/api")
app.include_router(maintenances.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(fuels.router, prefix="/api")
app.include_router(fuel_stations.router, prefix="/api")


@app.get("/api")
def root():
    """API root / health check."""
    has_rapidapi = bool(os.getenv("RAPIDAPI_KEY"))
    has_direct = bool(os.getenv("PLATE_API_TOKEN"))
    return {
        "status": "ok",
        "service": "RideLog \u2013 Suivi d'entretien v\u00e9hicules",
        "version": "1.0.0",
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
