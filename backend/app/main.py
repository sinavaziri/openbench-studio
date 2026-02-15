import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import api_keys, auth, benchmarks, health, notifications, runs, settings, stats, templates, ws
from app.core.config import API_PREFIX
from app.core.rate_limit import limiter, rate_limit_exceeded_handler, RateLimitHeadersMiddleware
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
    {
        "name": "stats",
        "description": "Analytics and statistics endpoints. Get aggregated run data for dashboards and visualizations.",
    },
    {
        "name": "notifications",
        "description": "Notification settings and history. Configure email and webhook notifications for run events.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup: run database migrations
    logger.info("Running database migrations...")
    run_migrations()
    logger.info("Database migrations complete")
    
    # Start the run scheduler
    from app.services.scheduler import scheduler
    await scheduler.start()
    logger.info("Run scheduler started")
    
    yield
    
    # Shutdown: stop the scheduler
    await scheduler.stop()
    logger.info("Run scheduler stopped")


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

Rate limits are enforced to ensure fair usage:

| Endpoint | Limit | Key |
|----------|-------|-----|
| `POST /auth/login` | 5/minute | IP address |
| `POST /auth/register` | 3/minute | IP address |
| `POST /runs` | 10/minute | User ID |
| `GET /available-models` | 30/minute | User ID |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Seconds until limit resets

When rate limited, you'll receive a `429 Too Many Requests` response with a `Retry-After` header.
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


# =============================================================================
# Rate Limiting
# =============================================================================

# Add rate limiter state to the app
app.state.limiter = limiter

# Add custom rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Add rate limit headers middleware
app.add_middleware(RateLimitHeadersMiddleware)


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
app.include_router(stats.router, prefix=API_PREFIX, tags=["stats"])
app.include_router(notifications.router, prefix=API_PREFIX, tags=["notifications"])
app.include_router(ws.router, prefix=API_PREFIX, tags=["websocket"])
