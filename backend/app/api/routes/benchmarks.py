"""
Benchmark catalog routes for discovering available benchmarks.

Benchmarks can come from multiple sources:
- Built-in benchmarks from OpenBench
- Inspect AI registry benchmarks
- Custom/plugin benchmarks
"""

from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.db.models import Benchmark
from app.services.benchmark_catalog import get_benchmark, get_benchmarks

router = APIRouter()


@router.get(
    "/benchmarks",
    response_model=List[Benchmark],
    summary="List benchmarks",
    description="List all available benchmarks that can be run.",
    responses={
        200: {
            "description": "List of available benchmarks",
            "content": {
                "application/json": {
                    "example": [{
                        "name": "mmlu",
                        "category": "Knowledge",
                        "description_short": "Massive Multitask Language Understanding",
                        "description": "MMLU tests models on 57 subjects...",
                        "tags": ["knowledge", "multiple-choice"],
                        "featured": True,
                        "source": "builtin"
                    }]
                }
            }
        }
    }
)
async def list_benchmarks():
    """
    List all available benchmarks.
    
    Dynamically discovers benchmarks via `bench list` if available,
    otherwise returns a curated static list of popular benchmarks.
    
    **Benchmark categories include:**
    - **Knowledge**: General knowledge and understanding (MMLU, ARC, etc.)
    - **Math**: Mathematical reasoning (GSM8K, MATH, etc.)
    - **Coding**: Code generation and understanding (HumanEval, MBPP, etc.)
    - **Reasoning**: Logical reasoning and inference
    - **Safety**: Safety and alignment evaluations
    
    This endpoint does not require authentication.
    
    Response is cached for 5 minutes as benchmark list rarely changes.
    """
    benchmarks = await get_benchmarks()
    # Return with cache headers - benchmark list is static/rarely changes
    return JSONResponse(
        content=[b.model_dump() for b in benchmarks],
        headers={
            "Cache-Control": "public, max-age=300",  # Cache for 5 minutes
            "Vary": "Accept-Encoding",
        }
    )


@router.get(
    "/benchmarks/{name}",
    response_model=Benchmark,
    summary="Get benchmark details",
    description="Get detailed information about a specific benchmark.",
    responses={
        200: {
            "description": "Benchmark details",
            "model": Benchmark,
        },
        404: {
            "description": "Benchmark not found",
            "content": {
                "application/json": {
                    "example": {"detail": "Benchmark not found"}
                }
            }
        }
    }
)
async def get_benchmark_detail(name: str):
    """
    Get details for a specific benchmark.
    
    Returns extended information including:
    - Full description (if available)
    - Category and tags
    - Whether it's a featured benchmark
    - Source (builtin, plugin, etc.)
    
    **Parameters:**
    - **name**: The benchmark identifier (e.g., "mmlu", "gsm8k", "humaneval")
    
    This endpoint does not require authentication.
    """
    benchmark = await get_benchmark(name)
    if benchmark is None:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return benchmark
