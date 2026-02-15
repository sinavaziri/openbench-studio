"""
Health and version endpoints for system status monitoring.

Provides:
- /health - Comprehensive health check with DB status, version, and uptime
- /ready - Kubernetes readiness probe (200 when ready, 503 when not)
- /version - Detailed version information
"""

import time
import subprocess
import shutil
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field, ConfigDict

from app.db.session import get_db

# Track application start time for uptime calculation
_start_time = time.time()

router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================

class HealthResponse(BaseModel):
    """Comprehensive health check response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "database": "connected",
                "version": "0.1.0",
                "uptime": 3600.5
            }
        }
    )
    
    status: Literal["healthy", "unhealthy"] = Field(
        description="Overall health status"
    )
    database: Literal["connected", "error"] = Field(
        description="Database connection status"
    )
    version: str = Field(
        description="Application version from pyproject.toml"
    )
    uptime: float = Field(
        description="Seconds since application start"
    )


class ReadyResponse(BaseModel):
    """Kubernetes readiness probe response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ready": True,
                "database": "connected"
            }
        }
    )
    
    ready: bool = Field(description="Whether the service is ready to accept traffic")
    database: Literal["connected", "error"] = Field(
        description="Database connection status"
    )


class VersionResponse(BaseModel):
    """Version information response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "web_ui": "0.1.0",
                "openbench": "0.5.3",
                "openbench_available": True
            }
        }
    )
    
    web_ui: str = Field(description="Web UI version")
    openbench: str | None = Field(None, description="OpenBench CLI version")
    openbench_available: bool = Field(description="Whether OpenBench CLI is installed")


# =============================================================================
# Helper Functions
# =============================================================================

def get_app_version() -> str:
    """Get the application version from package metadata."""
    try:
        from importlib.metadata import version
        return version("openbench-web-backend")
    except Exception:
        return "0.1.0"  # Fallback to pyproject.toml default


def get_openbench_version() -> str | None:
    """Get the installed OpenBench version."""
    try:
        # Try importing openbench to get version
        try:
            import openbench
            if hasattr(openbench, '__version__'):
                return openbench.__version__
        except ImportError:
            pass
        
        # Try using bench CLI
        if shutil.which("bench"):
            result = subprocess.run(
                ["bench", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                # Parse version from output (e.g., "bench version 0.5.3")
                output = result.stdout.strip()
                if output:
                    parts = output.split()
                    if len(parts) >= 2:
                        return parts[-1]  # Last part is usually the version
                    return output
        
        return None
    except Exception:
        return None


async def check_database() -> bool:
    """Check if database is accessible."""
    try:
        async with get_db() as db:
            await db.execute("SELECT 1")
            return True
    except Exception:
        return False


def get_uptime() -> float:
    """Get seconds since application start."""
    return time.time() - _start_time


# =============================================================================
# Endpoints
# =============================================================================

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="""
Comprehensive health check endpoint returning:
- **status**: Overall health (healthy/unhealthy)
- **database**: Database connectivity (connected/error)
- **version**: Application version from package metadata
- **uptime**: Seconds since application start

Use this endpoint for container health checks and monitoring systems.
    """,
    responses={
        200: {
            "description": "Health check result",
            "content": {
                "application/json": {
                    "examples": {
                        "healthy": {
                            "summary": "Healthy system",
                            "value": {
                                "status": "healthy",
                                "database": "connected",
                                "version": "0.1.0",
                                "uptime": 3600.5
                            }
                        },
                        "unhealthy": {
                            "summary": "Unhealthy system (DB error)",
                            "value": {
                                "status": "unhealthy",
                                "database": "error",
                                "version": "0.1.0",
                                "uptime": 120.0
                            }
                        }
                    }
                }
            }
        }
    }
)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    
    Returns comprehensive health information including database status,
    application version, and uptime. Always returns 200 to allow monitoring
    systems to parse the response body for health determination.
    """
    db_ok = await check_database()
    
    return HealthResponse(
        status="healthy" if db_ok else "unhealthy",
        database="connected" if db_ok else "error",
        version=get_app_version(),
        uptime=round(get_uptime(), 2)
    )


@router.get(
    "/ready",
    response_model=ReadyResponse,
    summary="Readiness probe",
    description="""
Kubernetes-style readiness probe endpoint.

Returns:
- **200**: Service is ready to accept traffic (database connected)
- **503**: Service is not ready (database unavailable)

Use this endpoint for Kubernetes readiness probes and load balancer health checks.
    """,
    responses={
        200: {
            "description": "Service is ready",
            "content": {
                "application/json": {
                    "example": {
                        "ready": True,
                        "database": "connected"
                    }
                }
            }
        },
        503: {
            "description": "Service is not ready",
            "content": {
                "application/json": {
                    "example": {
                        "ready": False,
                        "database": "error"
                    }
                }
            }
        }
    }
)
async def readiness_check(response: Response) -> ReadyResponse:
    """
    Kubernetes readiness probe endpoint.
    
    Returns 200 when the service is ready to accept traffic (database connected).
    Returns 503 when the service is not ready (database unavailable).
    
    This endpoint should be used for Kubernetes readiness probes to control
    traffic routing to pods.
    """
    db_ok = await check_database()
    
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return ReadyResponse(
        ready=db_ok,
        database="connected" if db_ok else "error"
    )


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Get version info",
    description="Get version information for OpenBench Studio and the underlying OpenBench CLI.",
    responses={
        200: {
            "description": "Version information",
            "content": {
                "application/json": {
                    "example": {
                        "web_ui": "0.1.0",
                        "openbench": "0.5.3",
                        "openbench_available": True
                    }
                }
            }
        }
    }
)
async def get_version() -> VersionResponse:
    """
    Get version information for OpenBench and the web UI.
    
    Returns:
    - **web_ui**: Version of the OpenBench Studio web interface
    - **openbench**: Version of the installed OpenBench CLI (if available)
    - **openbench_available**: Whether the OpenBench CLI is installed and accessible
    """
    openbench_version = get_openbench_version()
    
    return VersionResponse(
        web_ui=get_app_version(),
        openbench=openbench_version,
        openbench_available=openbench_version is not None,
    )
