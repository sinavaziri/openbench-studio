"""
Health and version endpoints for system status monitoring.
"""

from fastapi import APIRouter
import subprocess
import shutil

from app.db.models import HealthResponse, VersionResponse

router = APIRouter()


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


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Simple health check endpoint to verify the API is running.",
    responses={
        200: {
            "description": "API is healthy",
            "content": {
                "application/json": {
                    "example": {"status": "ok"}
                }
            }
        }
    }
)
async def health_check():
    """
    Health check endpoint.
    
    Returns a simple status response indicating the API is running.
    Use this endpoint for container health checks and load balancer probes.
    """
    return {"status": "ok"}


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
                        "web_ui": "1.0.0",
                        "openbench": "0.5.3",
                        "openbench_available": True
                    }
                }
            }
        }
    }
)
async def get_version():
    """
    Get version information for OpenBench and the web UI.
    
    Returns:
    - **web_ui**: Version of the OpenBench Studio web interface
    - **openbench**: Version of the installed OpenBench CLI (if available)
    - **openbench_available**: Whether the OpenBench CLI is installed and accessible
    """
    openbench_version = get_openbench_version()
    
    return {
        "web_ui": "1.0.0",
        "openbench": openbench_version,
        "openbench_available": openbench_version is not None,
    }
