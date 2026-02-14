import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_keys, auth, benchmarks, health, runs
from app.core.config import API_PREFIX
from app.db.migrations import run_migrations

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup: run database migrations
    logger.info("Running database migrations...")
    run_migrations()
    logger.info("Database migrations complete")
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="OpenBench Web API",
    description="API for running OpenBench benchmarks",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
# In Docker, nginx proxies requests so CORS is not strictly needed
# For local development, allow Vite dev server origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development (Vite)
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
        # Docker (nginx handles proxying)
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(api_keys.router, prefix=API_PREFIX)
app.include_router(benchmarks.router, prefix=API_PREFIX)
app.include_router(runs.router, prefix=API_PREFIX)
