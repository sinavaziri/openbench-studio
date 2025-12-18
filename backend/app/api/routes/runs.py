import asyncio
import os
from datetime import datetime
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.auth import get_current_user, get_optional_user
from app.core.config import RUNS_DIR
from app.db.models import Run, RunCreate, RunStatus, RunSummary, RunTagsUpdate, User
from app.runner.artifacts import list_artifacts, read_command, read_log_tail, read_summary
from app.runner.executor import executor
from app.runner.progress_parser import parse_progress
from app.services.api_keys import api_key_service
from app.services.run_store import run_store

router = APIRouter()


@router.post("/runs", response_model=dict)
async def create_run(
    run_create: RunCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Create and start a new benchmark run."""
    run = await run_store.create_run(run_create, user_id=current_user.user_id)
    
    # Get user's API keys for the run
    env_vars = await api_key_service.get_decrypted_keys_for_run(current_user.user_id)
    
    # Start execution in background with API keys
    background_tasks.add_task(executor.execute_run, run, env_vars)
    
    return {"run_id": run.run_id}


@router.get("/runs", response_model=list[RunSummary])
async def list_runs(
    limit: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None,
    benchmark: Optional[str] = None,
    tag: Optional[str] = None,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    List recent runs with optional filtering.
    
    Query parameters:
    - limit: Maximum number of runs (default 50)
    - search: Search in benchmark and model names
    - status: Filter by status (queued, running, completed, failed, canceled)
    - benchmark: Filter by exact benchmark name
    - tag: Filter by tag
    """
    user_id = current_user.user_id if current_user else None
    return await run_store.list_runs(
        limit=limit,
        user_id=user_id,
        search=search,
        status=status,
        benchmark=benchmark,
        tag=tag,
    )


@router.get("/runs/tags", response_model=list[str])
async def list_all_tags(
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Get all unique tags across all runs."""
    user_id = current_user.user_id if current_user else None
    return await run_store.get_all_tags(user_id=user_id)


@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    log_lines: int = 100,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get details for a specific run.
    
    Returns full run metadata including config, command, artifacts, logs, and summary.
    """
    user_id = current_user.user_id if current_user else None
    run = await run_store.get_run(run_id, user_id=user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Build response with additional info
    response = run.model_dump()
    response["artifacts"] = list_artifacts(run_id)
    
    # Read command.txt for reproducibility
    cmd = read_command(run_id)
    response["command"] = cmd
    
    response["stdout_tail"] = read_log_tail(run_id, "stdout.log", log_lines)
    response["stderr_tail"] = read_log_tail(run_id, "stderr.log", log_lines)
    
    # Read summary.json if available
    summary = read_summary(run_id)
    response["summary"] = summary
    
    return response


@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel a running benchmark."""
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    success = await executor.cancel_run(run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Run is not currently running")
    
    return {"status": "canceled"}


@router.delete("/runs/{run_id}")
async def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a run and all its artifacts.
    
    Cannot delete runs that are currently running.
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.status == RunStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete a running benchmark. Cancel it first.")
    
    success = await run_store.delete_run(run_id, user_id=current_user.user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete run")
    
    return {"status": "deleted"}


@router.patch("/runs/{run_id}/tags")
async def update_run_tags(
    run_id: str,
    tags_update: RunTagsUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update tags for a run.
    
    Tags are normalized (lowercase, unique, sorted).
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    updated_run = await run_store.update_tags(run_id, tags_update.tags, user_id=current_user.user_id)
    if updated_run is None:
        raise HTTPException(status_code=400, detail="Failed to update tags")
    
    return {"tags": updated_run.tags}


async def tail_file(path: str, position: int = 0) -> tuple[list[str], int]:
    """
    Read new lines from a file starting at position.
    Returns the new lines and the new position.
    """
    lines = []
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                f.seek(position)
                content = f.read()
                new_position = f.tell()
                if content:
                    lines = content.splitlines()
                return lines, new_position
    except Exception:
        pass
    return lines, position


def format_sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    import json
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@router.get("/runs/{run_id}/events")
async def stream_run_events(run_id: str, request: Request):
    """
    Stream run events via Server-Sent Events (SSE).
    
    Events:
    - status: Current run status
    - log_line: New log output (stdout or stderr)
    - progress: Best-effort progress extraction
    - completed: Run finished successfully
    - failed: Run failed
    - canceled: Run was canceled
    """
    run = await run_store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    async def event_generator() -> AsyncGenerator[str, None]:
        stdout_pos = 0
        stderr_pos = 0
        last_status = None
        last_progress = None
        heartbeat_count = 0
        
        artifact_dir = RUNS_DIR / run_id
        stdout_path = str(artifact_dir / "stdout.log")
        stderr_path = str(artifact_dir / "stderr.log")
        
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            
            # Get current run status
            current_run = await run_store.get_run(run_id)
            if current_run is None:
                break
            
            # Emit status if changed
            if current_run.status != last_status:
                last_status = current_run.status
                yield format_sse_event("status", {
                    "status": current_run.status.value if hasattr(current_run.status, 'value') else str(current_run.status),
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Tail stdout
            stdout_lines, stdout_pos = await tail_file(stdout_path, stdout_pos)
            for line in stdout_lines:
                yield format_sse_event("log_line", {
                    "stream": "stdout",
                    "line": line,
                })
                
                # Try to parse progress
                progress = parse_progress(line)
                if progress and progress != last_progress:
                    last_progress = progress
                    yield format_sse_event("progress", progress.to_dict())
            
            # Tail stderr
            stderr_lines, stderr_pos = await tail_file(stderr_path, stderr_pos)
            for line in stderr_lines:
                yield format_sse_event("log_line", {
                    "stream": "stderr",
                    "line": line,
                })
            
            # Check for terminal states
            if current_run.status == RunStatus.COMPLETED:
                yield format_sse_event("completed", {
                    "exit_code": current_run.exit_code,
                    "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                })
                break
            elif current_run.status == RunStatus.FAILED:
                yield format_sse_event("failed", {
                    "exit_code": current_run.exit_code,
                    "error": current_run.error,
                    "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                })
                break
            elif current_run.status == RunStatus.CANCELED:
                yield format_sse_event("canceled", {
                    "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                })
                break
            
            # Emit heartbeat every 5 iterations (~5 seconds)
            heartbeat_count += 1
            if heartbeat_count >= 5:
                heartbeat_count = 0
                yield format_sse_event("heartbeat", {
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Sleep before next iteration
            await asyncio.sleep(1)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )

