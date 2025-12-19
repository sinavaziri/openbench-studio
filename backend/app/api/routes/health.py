from fastapi import APIRouter
import subprocess
import shutil

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


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@router.get("/version")
async def get_version():
    """Get version information for OpenBench and the web UI."""
    openbench_version = get_openbench_version()
    
    return {
        "web_ui": "0.1.0",  # Your web UI version
        "openbench": openbench_version,
        "openbench_available": openbench_version is not None,
    }



