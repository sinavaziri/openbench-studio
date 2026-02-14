"""
WebSocket endpoint for real-time run progress updates.

Provides bidirectional communication for:
- Run status changes
- Log streaming
- Progress updates
- Dashboard live updates
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import RUNS_DIR
from app.db.models import RunStatus
from app.runner.progress_parser import parse_progress
from app.services.run_store import run_store

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and message broadcasting."""
    
    def __init__(self):
        # run_id -> list of WebSocket connections
        self._run_connections: dict[str, list[WebSocket]] = {}
        # Dashboard connections (all run updates)
        self._dashboard_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()
    
    async def connect_to_run(self, websocket: WebSocket, run_id: str):
        """Accept a WebSocket connection for a specific run."""
        await websocket.accept()
        async with self._lock:
            if run_id not in self._run_connections:
                self._run_connections[run_id] = []
            self._run_connections[run_id].append(websocket)
        logger.debug(f"WebSocket connected to run {run_id}")
    
    async def connect_to_dashboard(self, websocket: WebSocket):
        """Accept a WebSocket connection for dashboard updates."""
        await websocket.accept()
        async with self._lock:
            self._dashboard_connections.append(websocket)
        logger.debug("WebSocket connected to dashboard")
    
    async def disconnect_from_run(self, websocket: WebSocket, run_id: str):
        """Remove a WebSocket connection for a run."""
        async with self._lock:
            if run_id in self._run_connections:
                try:
                    self._run_connections[run_id].remove(websocket)
                    if not self._run_connections[run_id]:
                        del self._run_connections[run_id]
                except ValueError:
                    pass
        logger.debug(f"WebSocket disconnected from run {run_id}")
    
    async def disconnect_from_dashboard(self, websocket: WebSocket):
        """Remove a WebSocket connection from dashboard."""
        async with self._lock:
            try:
                self._dashboard_connections.remove(websocket)
            except ValueError:
                pass
        logger.debug("WebSocket disconnected from dashboard")
    
    async def broadcast_to_run(self, run_id: str, event_type: str, data: dict):
        """Broadcast a message to all connections watching a run."""
        message = json.dumps({"event": event_type, "data": data})
        async with self._lock:
            connections = self._run_connections.get(run_id, []).copy()
        
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up disconnected connections
        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    try:
                        self._run_connections.get(run_id, []).remove(conn)
                    except ValueError:
                        pass
    
    async def broadcast_to_dashboard(self, event_type: str, data: dict):
        """Broadcast a message to all dashboard connections."""
        message = json.dumps({"event": event_type, "data": data})
        async with self._lock:
            connections = self._dashboard_connections.copy()
        
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up disconnected connections
        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    try:
                        self._dashboard_connections.remove(conn)
                    except ValueError:
                        pass
    
    def has_run_connections(self, run_id: str) -> bool:
        """Check if there are any connections for a run."""
        return run_id in self._run_connections and len(self._run_connections[run_id]) > 0
    
    def has_dashboard_connections(self) -> bool:
        """Check if there are any dashboard connections."""
        return len(self._dashboard_connections) > 0


# Global connection manager
ws_manager = ConnectionManager()


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


@router.websocket("/ws/runs/{run_id}")
async def websocket_run_events(websocket: WebSocket, run_id: str):
    """
    WebSocket endpoint for streaming run events.
    
    Events sent:
    - status: Run status changes
    - log_line: New log output (stdout/stderr)
    - progress: Progress updates
    - completed: Run finished successfully
    - failed: Run failed
    - canceled: Run was canceled
    - heartbeat: Keep-alive ping
    
    Messages received:
    - ping: Client keepalive, responds with pong
    """
    # Verify run exists
    run = await run_store.get_run(run_id)
    if run is None:
        await websocket.close(code=4004, reason="Run not found")
        return
    
    await ws_manager.connect_to_run(websocket, run_id)
    
    stdout_pos = 0
    stderr_pos = 0
    last_status = None
    last_progress = None
    heartbeat_count = 0
    
    artifact_dir = RUNS_DIR / run_id
    stdout_path = str(artifact_dir / "stdout.log")
    stderr_path = str(artifact_dir / "stderr.log")
    
    try:
        # Send initial status
        await websocket.send_json({
            "event": "status",
            "data": {
                "status": run.status.value if hasattr(run.status, 'value') else str(run.status),
                "timestamp": datetime.utcnow().isoformat(),
            }
        })
        
        while True:
            # Check for incoming messages with a short timeout
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=1.0
                )
                # Handle ping/pong
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send_json({"event": "pong", "data": {}})
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                pass
            
            # Get current run status
            current_run = await run_store.get_run(run_id)
            if current_run is None:
                break
            
            # Emit status if changed
            if current_run.status != last_status:
                last_status = current_run.status
                await websocket.send_json({
                    "event": "status",
                    "data": {
                        "status": current_run.status.value if hasattr(current_run.status, 'value') else str(current_run.status),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                })
                
                # Also broadcast to dashboard
                await ws_manager.broadcast_to_dashboard("run_status", {
                    "run_id": run_id,
                    "status": current_run.status.value if hasattr(current_run.status, 'value') else str(current_run.status),
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Tail stdout
            stdout_lines, stdout_pos = await tail_file(stdout_path, stdout_pos)
            for line in stdout_lines:
                await websocket.send_json({
                    "event": "log_line",
                    "data": {"stream": "stdout", "line": line}
                })
                
                # Try to parse progress
                progress = parse_progress(line)
                if progress and progress != last_progress:
                    last_progress = progress
                    await websocket.send_json({
                        "event": "progress",
                        "data": progress.to_dict()
                    })
            
            # Tail stderr
            stderr_lines, stderr_pos = await tail_file(stderr_path, stderr_pos)
            for line in stderr_lines:
                await websocket.send_json({
                    "event": "log_line",
                    "data": {"stream": "stderr", "line": line}
                })
            
            # Check for terminal states
            if current_run.status == RunStatus.COMPLETED:
                await websocket.send_json({
                    "event": "completed",
                    "data": {
                        "exit_code": current_run.exit_code,
                        "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                    }
                })
                break
            elif current_run.status == RunStatus.FAILED:
                await websocket.send_json({
                    "event": "failed",
                    "data": {
                        "exit_code": current_run.exit_code,
                        "error": current_run.error,
                        "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                    }
                })
                break
            elif current_run.status == RunStatus.CANCELED:
                await websocket.send_json({
                    "event": "canceled",
                    "data": {
                        "finished_at": current_run.finished_at.isoformat() if current_run.finished_at else None,
                    }
                })
                break
            
            # Emit heartbeat every 5 iterations (~5 seconds)
            heartbeat_count += 1
            if heartbeat_count >= 5:
                heartbeat_count = 0
                await websocket.send_json({
                    "event": "heartbeat",
                    "data": {"timestamp": datetime.utcnow().isoformat()}
                })
    
    except WebSocketDisconnect:
        logger.debug(f"WebSocket disconnected from run {run_id}")
    except Exception as e:
        logger.error(f"WebSocket error for run {run_id}: {e}")
    finally:
        await ws_manager.disconnect_from_run(websocket, run_id)


@router.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """
    WebSocket endpoint for dashboard-level updates.
    
    Broadcasts all run status changes for live dashboard updates.
    
    Events sent:
    - run_status: A run's status changed
    - run_created: A new run was created
    - run_deleted: A run was deleted
    - heartbeat: Keep-alive ping
    
    Messages received:
    - ping: Client keepalive, responds with pong
    - subscribe: Subscribe to specific runs (optional)
    """
    await ws_manager.connect_to_dashboard(websocket)
    heartbeat_count = 0
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "event": "connected",
            "data": {"timestamp": datetime.utcnow().isoformat()}
        })
        
        while True:
            # Check for incoming messages
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=5.0
                )
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send_json({"event": "pong", "data": {}})
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                pass
            
            # Emit heartbeat periodically
            heartbeat_count += 1
            if heartbeat_count >= 6:  # Every ~30 seconds
                heartbeat_count = 0
                await websocket.send_json({
                    "event": "heartbeat",
                    "data": {"timestamp": datetime.utcnow().isoformat()}
                })
    
    except WebSocketDisconnect:
        logger.debug("Dashboard WebSocket disconnected")
    except Exception as e:
        logger.error(f"Dashboard WebSocket error: {e}")
    finally:
        await ws_manager.disconnect_from_dashboard(websocket)


async def broadcast_run_event(run_id: str, event_type: str, data: dict):
    """
    Helper function to broadcast run events from other modules.
    Call this from the executor when run state changes.
    """
    # Broadcast to run-specific connections
    await ws_manager.broadcast_to_run(run_id, event_type, data)
    
    # Also broadcast to dashboard
    dashboard_data = {"run_id": run_id, **data}
    await ws_manager.broadcast_to_dashboard(f"run_{event_type}", dashboard_data)


async def broadcast_run_created(run_id: str, benchmark: str, model: str, status: str):
    """Broadcast that a new run was created."""
    await ws_manager.broadcast_to_dashboard("run_created", {
        "run_id": run_id,
        "benchmark": benchmark,
        "model": model,
        "status": status,
        "timestamp": datetime.utcnow().isoformat(),
    })


async def broadcast_run_deleted(run_id: str):
    """Broadcast that a run was deleted."""
    await ws_manager.broadcast_to_dashboard("run_deleted", {
        "run_id": run_id,
        "timestamp": datetime.utcnow().isoformat(),
    })
