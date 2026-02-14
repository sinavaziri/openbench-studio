"""
Statistics endpoints for analytics dashboards.

Provides aggregated run data for visualization including:
- Run history over time
- Model performance comparisons
- Benchmark usage statistics
"""

from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_optional_user
from app.db.session import get_db
from app.db.models import User

router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================

class HistoryDataPoint(BaseModel):
    """A single data point for run history."""
    date: str  # ISO date string (YYYY-MM-DD)
    total: int
    completed: int
    failed: int
    avg_score: Optional[float] = None


class HistoryResponse(BaseModel):
    """Aggregated run history data."""
    data: List[HistoryDataPoint]
    period: str  # "day" or "week"
    start_date: str
    end_date: str


class ModelStats(BaseModel):
    """Statistics for a single model."""
    model: str
    run_count: int
    completed_count: int
    failed_count: int
    avg_score: Optional[float] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    success_rate: float


class ModelsResponse(BaseModel):
    """Model performance statistics."""
    models: List[ModelStats]
    total_runs: int


class BenchmarkStats(BaseModel):
    """Statistics for a single benchmark."""
    benchmark: str
    run_count: int
    completed_count: int
    failed_count: int
    avg_score: Optional[float] = None
    last_run: Optional[str] = None  # ISO datetime


class BenchmarksResponse(BaseModel):
    """Benchmark usage statistics."""
    benchmarks: List[BenchmarkStats]
    total_runs: int


class SummaryStats(BaseModel):
    """Summary statistics for the dashboard."""
    total_runs: int
    completed_runs: int
    failed_runs: int
    running_runs: int
    success_rate: float
    avg_score: Optional[float] = None
    unique_models: int
    unique_benchmarks: int


# =============================================================================
# Helper Functions
# =============================================================================

def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO date string to datetime."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except ValueError:
        # Try parsing just the date part
        try:
            return datetime.strptime(date_str[:10], '%Y-%m-%d')
        except ValueError:
            return None


# =============================================================================
# Endpoints
# =============================================================================

@router.get(
    "/stats/summary",
    response_model=SummaryStats,
    summary="Get summary statistics",
    description="Get overall summary statistics for the analytics dashboard.",
)
async def get_summary_stats(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to include"),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get summary statistics for the specified time period.
    
    Returns counts, success rates, and averages for quick overview.
    """
    user_id = current_user.user_id if current_user else None
    cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
    
    async with get_db() as db:
        # Build user filter
        user_filter = "(user_id = ? OR user_id IS NULL)" if user_id else "1=1"
        user_params = [user_id] if user_id else []
        
        # Get run counts by status
        cursor = await db.execute(
            f"""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
                AVG(CASE WHEN status = 'completed' AND primary_metric IS NOT NULL THEN primary_metric END) as avg_score,
                COUNT(DISTINCT model) as unique_models,
                COUNT(DISTINCT benchmark) as unique_benchmarks
            FROM runs 
            WHERE {user_filter} AND created_at >= ?
            """,
            (*user_params, cutoff_date),
        )
        row = await cursor.fetchone()
        
        total = row["total"] or 0
        completed = row["completed"] or 0
        failed = row["failed"] or 0
        running = row["running"] or 0
        
        # Calculate success rate (completed / (completed + failed))
        finished = completed + failed
        success_rate = (completed / finished * 100) if finished > 0 else 0.0
        
        return SummaryStats(
            total_runs=total,
            completed_runs=completed,
            failed_runs=failed,
            running_runs=running,
            success_rate=round(success_rate, 1),
            avg_score=round(row["avg_score"], 3) if row["avg_score"] is not None else None,
            unique_models=row["unique_models"] or 0,
            unique_benchmarks=row["unique_benchmarks"] or 0,
        )


@router.get(
    "/stats/history",
    response_model=HistoryResponse,
    summary="Get run history",
    description="Get aggregated run data over time for charting.",
)
async def get_run_history(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to include"),
    period: str = Query(default="day", regex="^(day|week)$", description="Aggregation period"),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get run history aggregated by day or week.
    
    Returns data points suitable for line charts showing:
    - Total runs per period
    - Completed vs failed runs
    - Average scores over time
    """
    user_id = current_user.user_id if current_user else None
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    async with get_db() as db:
        # Build user filter
        user_filter = "(user_id = ? OR user_id IS NULL)" if user_id else "1=1"
        user_params = [user_id] if user_id else []
        
        # Get all runs in the time range
        cursor = await db.execute(
            f"""
            SELECT 
                date(created_at) as run_date,
                status,
                primary_metric
            FROM runs 
            WHERE {user_filter} AND created_at >= ? AND created_at <= ?
            ORDER BY created_at ASC
            """,
            (*user_params, start_date.isoformat(), end_date.isoformat()),
        )
        rows = await cursor.fetchall()
    
    # Aggregate by period
    aggregated = {}
    
    for row in rows:
        run_date = row["run_date"]
        if not run_date:
            continue
            
        # Convert to period key
        if period == "week":
            # Get the Monday of the week
            dt = datetime.strptime(run_date, '%Y-%m-%d')
            week_start = dt - timedelta(days=dt.weekday())
            period_key = week_start.strftime('%Y-%m-%d')
        else:
            period_key = run_date
        
        if period_key not in aggregated:
            aggregated[period_key] = {
                "total": 0,
                "completed": 0,
                "failed": 0,
                "scores": [],
            }
        
        aggregated[period_key]["total"] += 1
        if row["status"] == "completed":
            aggregated[period_key]["completed"] += 1
            if row["primary_metric"] is not None:
                aggregated[period_key]["scores"].append(row["primary_metric"])
        elif row["status"] == "failed":
            aggregated[period_key]["failed"] += 1
    
    # Fill in missing periods
    current = start_date
    if period == "week":
        current = current - timedelta(days=current.weekday())  # Start from Monday
    
    all_periods = []
    while current <= end_date:
        period_key = current.strftime('%Y-%m-%d')
        data = aggregated.get(period_key, {"total": 0, "completed": 0, "failed": 0, "scores": []})
        
        avg_score = None
        if data["scores"]:
            avg_score = round(sum(data["scores"]) / len(data["scores"]), 3)
        
        all_periods.append(HistoryDataPoint(
            date=period_key,
            total=data["total"],
            completed=data["completed"],
            failed=data["failed"],
            avg_score=avg_score,
        ))
        
        if period == "week":
            current += timedelta(days=7)
        else:
            current += timedelta(days=1)
    
    return HistoryResponse(
        data=all_periods,
        period=period,
        start_date=start_date.strftime('%Y-%m-%d'),
        end_date=end_date.strftime('%Y-%m-%d'),
    )


@router.get(
    "/stats/models",
    response_model=ModelsResponse,
    summary="Get model statistics",
    description="Get run counts and performance metrics per model.",
)
async def get_model_stats(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to include"),
    limit: int = Query(default=10, ge=1, le=50, description="Max number of models to return"),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get statistics for each model used in runs.
    
    Returns data suitable for bar charts comparing:
    - Run counts per model
    - Average scores per model
    - Success rates per model
    """
    user_id = current_user.user_id if current_user else None
    cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
    
    async with get_db() as db:
        # Build user filter
        user_filter = "(user_id = ? OR user_id IS NULL)" if user_id else "1=1"
        user_params = [user_id] if user_id else []
        
        # Get model stats
        cursor = await db.execute(
            f"""
            SELECT 
                model,
                COUNT(*) as run_count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                AVG(CASE WHEN status = 'completed' AND primary_metric IS NOT NULL THEN primary_metric END) as avg_score,
                MIN(CASE WHEN status = 'completed' AND primary_metric IS NOT NULL THEN primary_metric END) as min_score,
                MAX(CASE WHEN status = 'completed' AND primary_metric IS NOT NULL THEN primary_metric END) as max_score
            FROM runs 
            WHERE {user_filter} AND created_at >= ?
            GROUP BY model
            ORDER BY run_count DESC
            LIMIT ?
            """,
            (*user_params, cutoff_date, limit),
        )
        rows = await cursor.fetchall()
        
        # Get total runs for context
        count_cursor = await db.execute(
            f"SELECT COUNT(*) as total FROM runs WHERE {user_filter} AND created_at >= ?",
            (*user_params, cutoff_date),
        )
        total_row = await count_cursor.fetchone()
        total_runs = total_row["total"] or 0
    
    models = []
    for row in rows:
        completed = row["completed_count"] or 0
        failed = row["failed_count"] or 0
        finished = completed + failed
        success_rate = (completed / finished * 100) if finished > 0 else 0.0
        
        models.append(ModelStats(
            model=row["model"],
            run_count=row["run_count"],
            completed_count=completed,
            failed_count=failed,
            avg_score=round(row["avg_score"], 3) if row["avg_score"] is not None else None,
            min_score=round(row["min_score"], 3) if row["min_score"] is not None else None,
            max_score=round(row["max_score"], 3) if row["max_score"] is not None else None,
            success_rate=round(success_rate, 1),
        ))
    
    return ModelsResponse(
        models=models,
        total_runs=total_runs,
    )


@router.get(
    "/stats/benchmarks",
    response_model=BenchmarksResponse,
    summary="Get benchmark statistics",
    description="Get usage statistics for each benchmark.",
)
async def get_benchmark_stats(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to include"),
    limit: int = Query(default=10, ge=1, le=50, description="Max number of benchmarks to return"),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get statistics for each benchmark used.
    
    Returns data suitable for pie charts showing:
    - Benchmark usage distribution
    - Success rates per benchmark
    """
    user_id = current_user.user_id if current_user else None
    cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
    
    async with get_db() as db:
        # Build user filter
        user_filter = "(user_id = ? OR user_id IS NULL)" if user_id else "1=1"
        user_params = [user_id] if user_id else []
        
        # Get benchmark stats
        cursor = await db.execute(
            f"""
            SELECT 
                benchmark,
                COUNT(*) as run_count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                AVG(CASE WHEN status = 'completed' AND primary_metric IS NOT NULL THEN primary_metric END) as avg_score,
                MAX(created_at) as last_run
            FROM runs 
            WHERE {user_filter} AND created_at >= ?
            GROUP BY benchmark
            ORDER BY run_count DESC
            LIMIT ?
            """,
            (*user_params, cutoff_date, limit),
        )
        rows = await cursor.fetchall()
        
        # Get total runs for context
        count_cursor = await db.execute(
            f"SELECT COUNT(*) as total FROM runs WHERE {user_filter} AND created_at >= ?",
            (*user_params, cutoff_date),
        )
        total_row = await count_cursor.fetchone()
        total_runs = total_row["total"] or 0
    
    benchmarks = []
    for row in rows:
        benchmarks.append(BenchmarkStats(
            benchmark=row["benchmark"],
            run_count=row["run_count"],
            completed_count=row["completed_count"] or 0,
            failed_count=row["failed_count"] or 0,
            avg_score=round(row["avg_score"], 3) if row["avg_score"] is not None else None,
            last_run=row["last_run"],
        ))
    
    return BenchmarksResponse(
        benchmarks=benchmarks,
        total_runs=total_runs,
    )
