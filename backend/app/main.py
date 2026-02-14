import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.routes import api_keys, auth, benchmarks, health, runs, settings, templates, ws
from app.core.config import API_PREFIX
from app.db.migrations import run_migrations

logger = logging.getLogger(__name__)


# =============================================================================
# API Tags Metadata (for OpenAPI organization)
# =============================================================================

tags_metadata = [
    {
        "name": "health",
        "description": "Health checks and system status endpoints.",
    },
    {
        "name": "auth",
        "description": "User authentication and account management. Register, login, and manage your profile.",
    },
    {
        "name": "api-keys",
        "description": "Manage API keys for LLM providers. Keys are encrypted at rest and used for benchmark runs.",
    },
    {
        "name": "settings",
        "description": "Import and export user settings. Backup and restore API keys with optional encryption.",
    },
    {
        "name": "benchmarks",
        "description": "Discover and explore available benchmarks. Browse the catalog of evaluation suites.",
    },
    {
        "name": "runs",
        "description": "Create, monitor, and manage benchmark runs. Execute evaluations and track results.",
    },
    {
        "name": "templates",
        "description": "Save and manage run templates. Reuse benchmark configurations for quick runs.",
    },
]


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
    title="OpenBench Studio API",
    description="""
## Overview

OpenBench Studio provides a web interface and API for running LLM benchmarks 
using [OpenBench](https://openbench.dev) and [Inspect AI](https://inspect.ai).

## Features

- 🔐 **User Authentication** - Secure JWT-based authentication
- 🔑 **API Key Management** - Store and manage provider API keys (encrypted)
- 📊 **Benchmark Discovery** - Browse available evaluation suites
- 🏃 **Run Management** - Execute, monitor, and analyze benchmark runs
- 📡 **Real-time Updates** - Server-Sent Events for live run progress

## Authentication

Most endpoints require authentication. Include the JWT token in the `Authorization` header:

```
Authorization: Bearer <your_access_token>
```

Obtain a token via `/api/auth/login` or `/api/auth/register`.

## Rate Limits

Currently no rate limits are enforced, but please be respectful of shared resources.
""",
    version="1.0.0",
    openapi_tags=tags_metadata,
    license_info={
        "name": "MIT",
        "identifier": "MIT",
    },
    contact={
        "name": "OpenBench Studio",
        "url": "https://github.com/openbench/openbench-studio",
    },
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


def custom_openapi():
    """Custom OpenAPI schema with additional metadata."""
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=tags_metadata,
    )
    
    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT access token obtained from /api/auth/login or /api/auth/register",
        }
    }
    
    # Add servers
    openapi_schema["servers"] = [
        {"url": "/", "description": "Current server"},
        {"url": "http://localhost:8000", "description": "Local development"},
        {"url": "http://localhost:3000", "description": "Docker (via nginx proxy)"},
    ]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


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

# Include routers with tags
app.include_router(health.router, prefix=API_PREFIX, tags=["health"])
app.include_router(auth.router, prefix=API_PREFIX, tags=["auth"])
app.include_router(api_keys.router, prefix=API_PREFIX, tags=["api-keys"])
app.include_router(settings.router, prefix=API_PREFIX, tags=["settings"])
app.include_router(benchmarks.router, prefix=API_PREFIX, tags=["benchmarks"])
app.include_router(runs.router, prefix=API_PREFIX, tags=["runs"])
app.include_router(templates.router, prefix=API_PREFIX, tags=["templates"])
app.include_router(ws.router, prefix=API_PREFIX, tags=["websocket"])
