"""
Benchmark run management routes.

Handles creating, monitoring, and managing benchmark runs.
Includes Server-Sent Events (SSE) for real-time progress updates.
"""

import asyncio
import os
from datetime import datetime
from typing import AsyncGenerator, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse

from app.core.auth import get_current_user, get_optional_user
from app.core.config import RUNS_DIR
from app.core.errors import (
    RunNotFoundError,
    RunStillRunningError,
    RunNotRunningError,
    ForbiddenError,
    NotFoundError,
    ServerError,
    ValidationError,
    ExternalServiceError,
)
from app.db.models import (
    Run, 
    RunCreate, 
    RunStatus, 
    RunSummary, 
    RunTagsUpdate,
    RunNotesUpdate,
    User,
    RunCreatedResponse,
    MessageResponse,
    TagsResponse,
    BulkDeleteResponse,
)
from app.runner.artifacts import list_artifacts, read_command, read_log_tail, read_summary
from app.runner.executor import executor
from app.runner.progress_parser import parse_progress
from app.services.api_keys import api_key_service
from app.services.run_store import run_store

router = APIRouter()


@router.post(
    "/runs",
    response_model=RunCreatedResponse,
    summary="Create benchmark run",
    description="Create and start a new benchmark run.",
    responses={
        200: {
            "description": "Run created and started",
            "content": {
                "application/json": {
                    "example": {"run_id": "550e8400-e29b-41d4-a716-446655440000"}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        422: {
            "description": "Validation error",
        }
    }
)
async def create_run(
    run_create: RunCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Create and start a new benchmark run.
    
    The run is created immediately and execution begins in the background.
    Use the returned `run_id` to monitor progress via SSE or polling.
    
    **Required fields:**
    - **benchmark**: Name of the benchmark (e.g., "mmlu", "gsm8k")
    - **model**: Model identifier (e.g., "openai/gpt-4o")
    
    **Optional fields:**
    - **limit**: Limit number of samples (useful for testing)
    - **temperature**: Sampling temperature (0=deterministic)
    - **epochs**: Number of evaluation epochs
    
    **Note:** The appropriate API key must be configured for the model's provider.
    
    **Requires authentication.**
    """
    run = await run_store.create_run(run_create, user_id=current_user.user_id)
    
    # Get user's API keys for the run
    env_vars = await api_key_service.get_decrypted_keys_for_run(current_user.user_id)
    
    # Start execution in background with API keys
    background_tasks.add_task(executor.execute_run, run, env_vars)
    
    return {"run_id": run.run_id}


@router.get(
    "/runs",
    response_model=List[RunSummary],
    summary="List runs",
    description="List recent benchmark runs with optional filtering.",
    responses={
        200: {
            "description": "List of run summaries",
            "content": {
                "application/json": {
                    "example": [{
                        "run_id": "550e8400-e29b-41d4-a716-446655440000",
                        "benchmark": "mmlu",
                        "model": "openai/gpt-4o",
                        "status": "completed",
                        "created_at": "2024-01-15T10:30:00Z",
                        "finished_at": "2024-01-15T10:45:00Z",
                        "primary_metric": 0.85,
                        "primary_metric_name": "accuracy",
                        "tags": ["baseline"]
                    }]
                }
            }
        }
    }
)
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
    
    **Query parameters:**
    - **limit**: Maximum number of runs to return (default: 50)
    - **search**: Search in benchmark and model names
    - **status**: Filter by status (`queued`, `running`, `completed`, `failed`, `canceled`)
    - **benchmark**: Filter by exact benchmark name
    - **tag**: Filter by tag
    
    Returns runs owned by the current user if authenticated,
    or all public runs if not authenticated.
    
    Authentication is optional for this endpoint.
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


@router.get(
    "/runs/tags",
    response_model=List[str],
    summary="List all tags",
    description="Get all unique tags across all runs.",
    responses={
        200: {
            "description": "List of unique tags",
            "content": {
                "application/json": {
                    "example": ["baseline", "production", "v2", "experiment"]
                }
            }
        }
    }
)
async def list_all_tags(
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get all unique tags across all runs.
    
    Useful for building tag autocomplete or filter dropdowns.
    
    Authentication is optional for this endpoint.
    """
    user_id = current_user.user_id if current_user else None
    return await run_store.get_all_tags(user_id=user_id)


@router.get(
    "/runs/{run_id}",
    summary="Get run details",
    description="Get full details for a specific run including logs and artifacts.",
    responses={
        200: {
            "description": "Full run details",
            "content": {
                "application/json": {
                    "example": {
                        "run_id": "550e8400-e29b-41d4-a716-446655440000",
                        "benchmark": "mmlu",
                        "model": "openai/gpt-4o",
                        "status": "completed",
                        "artifacts": ["stdout.log", "stderr.log", "summary.json"],
                        "command": "bench run mmlu --model openai/gpt-4o",
                        "stdout_tail": ["Running evaluation...", "Completed."],
                        "stderr_tail": [],
                        "summary": {"accuracy": 0.85}
                    }
                }
            }
        },
        404: {
            "description": "Run not found",
        }
    }
)
async def get_run(
    run_id: str,
    log_lines: int = 100,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Get details for a specific run.
    
    Returns full run metadata including:
    - Run configuration and status
    - List of available artifacts
    - Reproducible command
    - Tail of stdout/stderr logs
    - Summary results (if completed)
    
    **Parameters:**
    - **run_id**: The unique run identifier
    - **log_lines**: Number of log lines to include (default: 100)
    
    Authentication is optional for this endpoint.
    """
    user_id = current_user.user_id if current_user else None
    run = await run_store.get_run(run_id, user_id=user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
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


@router.post(
    "/runs/{run_id}/cancel",
    response_model=MessageResponse,
    summary="Cancel run",
    description="Cancel a running benchmark.",
    responses={
        200: {
            "description": "Run canceled",
            "content": {
                "application/json": {
                    "example": {"status": "canceled"}
                }
            }
        },
        400: {
            "description": "Run is not currently running",
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Run not found",
        }
    }
)
async def cancel_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Cancel a running benchmark.
    
    Sends a termination signal to the running process.
    The run status will be updated to `canceled`.
    
    **Requires authentication.**
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    success = await executor.cancel_run(run_id)
    if not success:
        raise RunNotRunningError()
    
    return {"status": "canceled"}


@router.delete(
    "/runs/{run_id}",
    response_model=MessageResponse,
    summary="Delete run",
    description="Delete a run and all its artifacts.",
    responses={
        200: {
            "description": "Run deleted",
            "content": {
                "application/json": {
                    "example": {"status": "deleted"}
                }
            }
        },
        400: {
            "description": "Cannot delete a running benchmark",
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Run not found",
        },
        500: {
            "description": "Failed to delete run",
        }
    }
)
async def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a run and all its artifacts.
    
    This permanently removes:
    - Run metadata from the database
    - All log files and artifacts
    - Evaluation results
    
    **Note:** Cannot delete runs that are currently running.
    Cancel the run first.
    
    **Requires authentication.**
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    if run.status == RunStatus.RUNNING:
        raise RunStillRunningError(action="delete")
    
    success = await run_store.delete_run(run_id, user_id=current_user.user_id)
    if not success:
        raise ServerError(
            message="Failed to delete run",
            detail="An error occurred while deleting the run. Please try again."
        )
    
    return {"status": "deleted"}


@router.post(
    "/runs/bulk-delete",
    response_model=BulkDeleteResponse,
    summary="Bulk delete runs",
    description="Delete multiple runs at once.",
    responses={
        200: {
            "description": "Bulk delete results",
            "content": {
                "application/json": {
                    "example": {
                        "status": "completed",
                        "summary": {
                            "total": 5,
                            "deleted": 3,
                            "failed": 0,
                            "running": 1,
                            "not_found": 1
                        },
                        "details": {
                            "deleted": ["id1", "id2", "id3"],
                            "failed": [],
                            "running": ["id4"],
                            "not_found": ["id5"]
                        }
                    }
                }
            }
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def bulk_delete_runs(
    run_ids: List[str],
    current_user: User = Depends(get_current_user),
):
    """
    Delete multiple runs at once.
    
    Returns a summary of successes and failures for each run.
    
    **Behavior:**
    - Running runs are skipped (listed in `running`)
    - Non-existent runs are skipped (listed in `not_found`)
    - Successfully deleted runs are in `deleted`
    - Failed deletions are in `failed`
    
    **Requires authentication.**
    """
    results = {
        "deleted": [],
        "failed": [],
        "running": [],
        "not_found": []
    }
    
    for run_id in run_ids:
        run = await run_store.get_run(run_id, user_id=current_user.user_id)
        
        if run is None:
            results["not_found"].append(run_id)
            continue
        
        if run.status == RunStatus.RUNNING:
            results["running"].append(run_id)
            continue
        
        success = await run_store.delete_run(run_id, user_id=current_user.user_id)
        if success:
            results["deleted"].append(run_id)
        else:
            results["failed"].append(run_id)
    
    return {
        "status": "completed",
        "summary": {
            "total": len(run_ids),
            "deleted": len(results["deleted"]),
            "failed": len(results["failed"]),
            "running": len(results["running"]),
            "not_found": len(results["not_found"])
        },
        "details": results
    }


@router.patch(
    "/runs/{run_id}/tags",
    response_model=TagsResponse,
    summary="Update run tags",
    description="Update tags for a run.",
    responses={
        200: {
            "description": "Updated tags",
            "content": {
                "application/json": {
                    "example": {"tags": ["baseline", "production", "v2"]}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Run not found",
        },
        500: {
            "description": "Failed to update tags",
        }
    }
)
async def update_run_tags(
    run_id: str,
    tags_update: RunTagsUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update tags for a run.
    
    Tags are:
    - Normalized to lowercase
    - Deduplicated
    - Sorted alphabetically
    
    This replaces all existing tags with the new list.
    
    **Requires authentication.**
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    updated_run = await run_store.update_tags(run_id, tags_update.tags, user_id=current_user.user_id)
    if updated_run is None:
        raise ServerError(
            message="Failed to update tags",
            detail="An error occurred while saving the tags. Please try again."
        )
    
    return {"tags": updated_run.tags}


@router.patch(
    "/runs/{run_id}/notes",
    summary="Update run notes",
    description="Update the notes for a specific run. Notes can be any text.",
    responses={
        200: {
            "description": "Notes updated successfully",
            "content": {
                "application/json": {
                    "example": {"notes": "This run uses the updated prompt format."}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "Run not found",
        },
        500: {
            "description": "Failed to update notes",
        }
    }
)
async def update_run_notes(
    run_id: str,
    notes_update: RunNotesUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update notes for a run.
    
    Notes can be any freeform text. Pass `null` or an empty string to clear notes.
    
    **Requires authentication.**
    """
    run = await run_store.get_run(run_id, user_id=current_user.user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    updated_run = await run_store.update_notes(run_id, notes_update.notes, user_id=current_user.user_id)
    if updated_run is None:
        raise ServerError(
            message="Failed to update notes",
            detail="An error occurred while saving the notes. Please try again."
        )
    
    return {"notes": updated_run.notes}


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


@router.get(
    "/runs/{run_id}/events",
    summary="Stream run events (SSE)",
    description="Stream real-time run events via Server-Sent Events.",
    responses={
        200: {
            "description": "SSE event stream",
            "content": {
                "text/event-stream": {
                    "example": "event: status\ndata: {\"status\": \"running\"}\n\n"
                }
            }
        },
        404: {
            "description": "Run not found",
        }
    }
)
async def stream_run_events(run_id: str, request: Request):
    """
    Stream run events via Server-Sent Events (SSE).
    
    Connect to this endpoint to receive real-time updates about a run.
    The connection stays open until the run completes or is canceled.
    
    **Event types:**
    - `status`: Run status changed (running, completed, etc.)
    - `log_line`: New log output with `stream` (stdout/stderr) and `line`
    - `progress`: Best-effort progress extraction with percentage/current/total
    - `completed`: Run finished successfully
    - `failed`: Run failed with error details
    - `canceled`: Run was canceled
    - `heartbeat`: Keep-alive sent every ~5 seconds
    
    **Example client (JavaScript):**
    ```javascript
    const events = new EventSource('/api/runs/{run_id}/events');
    events.addEventListener('log_line', (e) => {
        const data = JSON.parse(e.data);
        console.log(data.line);
    });
    ```
    
    Authentication is not required for this endpoint.
    """
    run = await run_store.get_run(run_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
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


@router.get(
    "/runs/{run_id}/artifacts/{artifact_path:path}",
    summary="Download artifact",
    description="Download a specific artifact file from a run.",
    responses={
        200: {
            "description": "Artifact file",
            "content": {
                "application/octet-stream": {},
                "application/json": {},
                "text/plain": {},
            }
        },
        403: {
            "description": "Access forbidden (path traversal attempt)",
        },
        404: {
            "description": "Run or artifact not found",
        }
    }
)
async def download_artifact(
    run_id: str,
    artifact_path: str,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Download a specific artifact file from a run.
    
    Supports nested paths like `logs/file.eval` or `results/summary.json`.
    
    **Common artifacts:**
    - `stdout.log`: Standard output from the benchmark
    - `stderr.log`: Standard error output
    - `summary.json`: Evaluation summary and metrics
    - `*.eval`: Inspect AI evaluation logs
    
    **Security:** Path traversal is prevented; the path must resolve
    within the run's artifact directory.
    
    Authentication is optional for this endpoint.
    """
    user_id = current_user.user_id if current_user else None
    run = await run_store.get_run(run_id, user_id=user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    # Build the full path and validate it's within the run directory
    artifact_dir = RUNS_DIR / run_id
    file_path = artifact_dir / artifact_path
    
    # Security check: ensure the path doesn't escape the run directory
    try:
        file_path = file_path.resolve()
        artifact_dir = artifact_dir.resolve()
        if not str(file_path).startswith(str(artifact_dir)):
            raise ForbiddenError(
                message="Access to this file is not allowed",
                detail="The requested path is outside the run directory."
            )
    except ForbiddenError:
        raise
    except Exception:
        raise ForbiddenError(
            message="Invalid file path",
            detail="The requested path could not be resolved."
        )
    
    if not file_path.exists() or not file_path.is_file():
        raise NotFoundError(
            resource="Artifact",
            detail=f"File '{artifact_path}' not found in this run's artifacts."
        )
    
    # Determine media type based on file extension
    media_type = "application/octet-stream"
    if artifact_path.endswith('.json'):
        media_type = "application/json"
    elif artifact_path.endswith('.txt'):
        media_type = "text/plain"
    elif artifact_path.endswith('.log'):
        media_type = "text/plain"
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


@router.get(
    "/runs/{run_id}/eval-data/{eval_path:path}",
    summary="Get parsed eval data",
    description="Parse and return structured data from an .eval file for viewing in the UI.",
    responses={
        200: {
            "description": "Parsed evaluation data",
            "content": {
                "application/json": {
                    "example": {
                        "status": "success",
                        "eval_name": "mmlu",
                        "model": "openai/gpt-4o",
                        "total_samples": 100,
                        "metrics": {
                            "accuracy": {"value": 0.85, "name": "accuracy"}
                        },
                        "samples": [
                            {"id": 1, "input": "...", "output": "...", "score": {"value": 1.0}}
                        ]
                    }
                }
            }
        },
        403: {
            "description": "Access forbidden",
        },
        404: {
            "description": "Run or eval file not found",
        },
        422: {
            "description": "Only .eval files can be parsed",
        },
        500: {
            "description": "Failed to parse evaluation results",
        },
        502: {
            "description": "inspect_ai package not available",
        }
    }
)
async def get_eval_data(
    run_id: str,
    eval_path: str,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Parse and return structured data from an .eval file.
    
    This endpoint parses Inspect AI evaluation logs and returns
    a structured JSON response for display in the web UI.
    
    **Returns:**
    - Evaluation metadata (name, model, timestamps)
    - Aggregate metrics (accuracy, scores, etc.)
    - Individual sample results (limited to first 100)
    
    **Note:** Requires the `inspect_ai` package to be installed.
    
    Authentication is optional for this endpoint.
    """
    user_id = current_user.user_id if current_user else None
    run = await run_store.get_run(run_id, user_id=user_id)
    if run is None:
        raise RunNotFoundError(run_id)
    
    # Build the full path and validate
    artifact_dir = RUNS_DIR / run_id
    file_path = artifact_dir / eval_path
    
    # Security check
    try:
        file_path = file_path.resolve()
        artifact_dir = artifact_dir.resolve()
        if not str(file_path).startswith(str(artifact_dir)):
            raise ForbiddenError(
                message="Access to this file is not allowed",
                detail="The requested path is outside the run directory."
            )
    except ForbiddenError:
        raise
    except Exception:
        raise ForbiddenError(
            message="Invalid file path",
            detail="The requested path could not be resolved."
        )
    
    if not file_path.exists() or not file_path.is_file():
        raise NotFoundError(
            resource="Eval file",
            detail=f"File '{eval_path}' not found. The benchmark may not have completed yet."
        )
    
    # Only allow .eval files
    if not file_path.suffix == '.eval':
        raise ValidationError(
            message="Only .eval files can be parsed in the browser",
            detail="Download the file to view it with another tool."
        )
    
    try:
        # Import inspect_ai to read the eval log
        from inspect_ai.log import read_eval_log
        import asyncio
        
        # Read the eval log (needs to run in a new event loop to avoid conflicts)
        def _read_log():
            return read_eval_log(str(file_path))
        
        # Run in executor to avoid event loop conflicts
        loop = asyncio.get_running_loop()
        log = await loop.run_in_executor(None, _read_log)
        
        # Extract key information
        result = {
            "status": log.status if hasattr(log, 'status') else None,
            "eval_name": log.eval.task if hasattr(log.eval, 'task') else None,
            "model": log.eval.model if hasattr(log.eval, 'model') else None,
            "dataset": log.eval.dataset.name if hasattr(log.eval, 'dataset') and log.eval.dataset else None,
            "created": str(log.eval.created) if hasattr(log.eval, 'created') and log.eval.created else None,
            "completed": str(log.eval.completed) if hasattr(log.eval, 'completed') and log.eval.completed else None,
            "total_samples": len(log.samples) if hasattr(log, 'samples') and log.samples else 0,
            "metrics": {},
            "samples": [],
            "config": {
                "limit": log.eval.config.limit if hasattr(log.eval, 'config') and hasattr(log.eval.config, 'limit') else None,
                "epochs": log.eval.config.epochs if hasattr(log.eval, 'config') and hasattr(log.eval.config, 'epochs') else None,
            }
        }
        
        # Extract metrics (scores)
        if log.results and log.results.scores:
            for score in log.results.scores:
                # EvalScore has metrics dictionary, not a direct value
                if hasattr(score, 'metrics') and score.metrics:
                    for metric_name, metric_data in score.metrics.items():
                        # metric_data is an EvalMetric object
                        result["metrics"][metric_name] = {
                            "value": float(metric_data.value) if metric_data.value is not None else None,
                            "name": metric_data.name if hasattr(metric_data, 'name') else metric_name,
                            "reducer": score.reducer if hasattr(score, 'reducer') else None,
                        }
        
        # Extract sample information (limit to first 100 for performance)
        if log.samples:
            for i, sample in enumerate(log.samples[:100]):
                sample_data = {
                    "id": sample.id if hasattr(sample, 'id') else i,
                    "epoch": sample.epoch if hasattr(sample, 'epoch') else 1,
                    "input": str(sample.input)[:500] if sample.input else None,  # Truncate long inputs
                    "target": str(sample.target)[:500] if sample.target else None,
                    "output": None,
                    "score": None,
                    "error": sample.error if hasattr(sample, 'error') and sample.error else None,
                }
                
                # Extract output from the last message
                if sample.messages and len(sample.messages) > 0:
                    last_msg = sample.messages[-1]
                    if hasattr(last_msg, 'content'):
                        sample_data["output"] = str(last_msg.content)[:500]  # Truncate
                
                # Extract score
                if sample.scores:
                    # sample.scores is a dictionary of scorer_name -> score_data
                    if isinstance(sample.scores, dict):
                        # Get the first score from the dictionary
                        score_name, score_data = next(iter(sample.scores.items()))
                        if isinstance(score_data, dict):
                            # Try to convert value to float, handle cases where it's a string
                            score_value = None
                            try:
                                if score_data.get('value') is not None:
                                    score_value = float(score_data['value'])
                            except (ValueError, TypeError):
                                # If value is not numeric (e.g., "C"), compute correctness score
                                # by comparing answer to target (1.0 if match, 0.0 if not)
                                if 'answer' in score_data and sample.target:
                                    score_value = 1.0 if str(score_data['answer']) == str(sample.target) else 0.0
                            
                            sample_data["score"] = {
                                "value": score_value,
                                "name": score_name,
                                "explanation": score_data.get('explanation'),
                            }
                    elif hasattr(sample.scores, 'value'):
                        # Fallback for older formats
                        score_value = None
                        try:
                            if sample.scores.value is not None:
                                score_value = float(sample.scores.value)
                        except (ValueError, TypeError):
                            # If value is not numeric, try to compute from answer/target
                            if hasattr(sample.scores, 'answer') and sample.target:
                                score_value = 1.0 if str(sample.scores.answer) == str(sample.target) else 0.0
                        
                        sample_data["score"] = {
                            "value": score_value,
                            "name": sample.scores.name if hasattr(sample.scores, 'name') else "score",
                            "explanation": sample.scores.explanation if hasattr(sample.scores, 'explanation') else None,
                        }
                
                result["samples"].append(sample_data)
        
        return result
        
    except ImportError as e:
        import traceback
        traceback.print_exc()
        raise ExternalServiceError(
            service="inspect_ai",
            detail=f"The inspect_ai package is required to view evaluation results but is not installed: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise ServerError(
            message="Failed to parse evaluation results",
            detail=f"The evaluation file could not be parsed: {str(e)}. The file may be corrupted or in an unexpected format."
        )
