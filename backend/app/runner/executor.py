"""
Benchmark run executor.

Executes benchmark runs as subprocesses, handling:
- Real `bench` CLI when available
- Mock mode for development/testing
- Graceful cancellation
- Output parsing and result storage
- Automatic retry with exponential backoff on transient errors
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import RUNS_DIR
from app.core.retry import (
    RetryConfig,
    RetryState,
    calculate_delay,
    is_retryable_status_code,
    RETRYABLE_STATUS_CODES,
    NON_RETRYABLE_STATUS_CODES,
)
from app.db.models import Run, RunConfig, RunStatus
from app.runner.command_builder import build_mock_command, command_to_string
from app.runner.summary_parser import parse_and_write_summary
from app.services.notifications import notification_service
from app.services.run_store import run_store

# Configure logging
logger = logging.getLogger(__name__)

# Import WebSocket broadcasting (deferred to avoid circular imports)
_ws_broadcast = None

def _get_ws_broadcast():
    """Lazy import of WebSocket broadcast function to avoid circular imports."""
    global _ws_broadcast
    if _ws_broadcast is None:
        from app.api.routes.ws import broadcast_run_event
        _ws_broadcast = broadcast_run_event
    return _ws_broadcast


class BenchCLINotFoundError(Exception):
    """Raised when bench CLI is required but not available."""
    pass


class RunExecutor:
    """
    Executes benchmark runs as subprocesses.
    
    Features:
    - Automatic mock mode when bench CLI is unavailable
    - Graceful cancellation support
    - Comprehensive logging for debugging
    - Error detection and classification
    - Automatic retry with exponential backoff on transient errors
    """

    # Retry configuration for benchmark execution
    MAX_RETRIES = 5
    BASE_DELAY = 1.0  # 1s → 2s → 4s → 8s → 16s → 32s

    def __init__(self):
        self._running_processes: dict[str, subprocess.Popen] = {}
        self._canceled_runs: set[str] = set()
        self._mock_mode: Optional[bool] = None
        self._retry_states: dict[str, RetryState] = {}
        
    def _check_bench_available(self) -> bool:
        """
        Check if the 'bench' CLI is available.
        
        Caches the result for efficiency.
        """
        if self._mock_mode is None:
            available = shutil.which("bench") is not None
            self._mock_mode = not available
            if self._mock_mode:
                logger.info("bench CLI not found - running in mock mode")
            else:
                logger.info("bench CLI found - running in production mode")
        return not self._mock_mode

    def is_mock_mode(self) -> bool:
        """Return True if running in mock mode (no bench CLI)."""
        self._check_bench_available()
        return self._mock_mode

    async def _broadcast_retry_status(
        self,
        run_id: str,
        attempt: int,
        max_retries: int,
        delay: float,
        error: str,
        total_delay: float,
    ) -> None:
        """Broadcast retry status via WebSocket."""
        try:
            broadcast = _get_ws_broadcast()
            await broadcast(run_id, "retrying", {
                "attempt": attempt,
                "max_retries": max_retries,
                "delay": round(delay, 2),
                "error": error,
                "total_delay": round(total_delay, 2),
                "timestamp": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            logger.debug(f"Run {run_id}: Retry broadcast failed: {e}")

    def _get_retry_state(self, run_id: str, provider: Optional[str] = None) -> RetryState:
        """Get or create retry state for a run."""
        if run_id not in self._retry_states:
            self._retry_states[run_id] = RetryState(
                operation=f"benchmark_run:{run_id}",
                provider=provider,
                max_retries=self.MAX_RETRIES,
            )
        return self._retry_states[run_id]

    def _clear_retry_state(self, run_id: str) -> None:
        """Clear retry state for a run."""
        self._retry_states.pop(run_id, None)

    def _create_artifact_dir(self, run_id: str) -> Path:
        """Create the artifact directory for a run."""
        artifact_dir = RUNS_DIR / run_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Created artifact directory: {artifact_dir}")
        return artifact_dir

    def _write_config(self, artifact_dir: Path, config: RunConfig) -> None:
        """Write the run configuration to config.json."""
        config_path = artifact_dir / "config.json"
        with open(config_path, "w") as f:
            json.dump(config.model_dump(), f, indent=2)
        logger.debug(f"Wrote config to {config_path}")

    def _write_command(self, artifact_dir: Path, cmd: list[str]) -> None:
        """Write the command to command.txt."""
        command_path = artifact_dir / "command.txt"
        with open(command_path, "w") as f:
            f.write(command_to_string(cmd))
        logger.debug(f"Wrote command to {command_path}")

    def _detect_failure(self, stdout_content: str, stderr_content: str) -> tuple[bool, Optional[str], bool]:
        """
        Detect benchmark failures from output content.
        
        The bench CLI sometimes returns exit code 0 even when tasks fail,
        so we need to inspect the output for error patterns.
        
        Args:
            stdout_content: Content from stdout.log
            stderr_content: Content from stderr.log
            
        Returns:
            Tuple of (is_failure, error_message, is_retryable)
        """
        # Patterns: (pattern, default_message, is_retryable)
        failure_patterns = [
            ("Task interrupted (no samples completed", "Benchmark interrupted - no samples completed", False),
            ("Error code:", None, False),  # Extract actual error
            ("NotFoundError:", "Model not found or access denied", False),
            ("does not exist or you do not have access", "Model not found or access denied", False),
            ("model_not_found", "Model not found", False),
            ("AuthenticationError:", "Authentication failed - check API key", False),
            ("PermissionDeniedError:", "Permission denied - check API key permissions", False),
            # Retryable errors
            ("RateLimitError:", "Rate limit exceeded", True),  # 429
            ("rate_limit_exceeded", "Rate limit exceeded", True),
            ("Too Many Requests", "Too many requests - rate limited", True),
            ("InternalServerError:", "Provider server error", True),  # 500
            ("ServiceUnavailableError:", "Provider service unavailable", True),  # 503
            ("BadGatewayError:", "Provider bad gateway", True),  # 502
            ("GatewayTimeoutError:", "Provider gateway timeout", True),  # 504
            ("Connection refused", "Connection refused - service may be down", True),
            ("Connection reset", "Connection reset - service may be down", True),
            ("ETIMEDOUT", "Connection timed out", True),
            ("ECONNRESET", "Connection reset by peer", True),
            # Non-retryable errors
            ("InsufficientQuotaError:", "Insufficient API quota", False),
            ("InvalidRequestError:", "Invalid request parameters", False),
            ("[CANCELED]", "Run was canceled by user", False),
        ]
        
        combined_content = stdout_content + "\n" + stderr_content
        
        for pattern, default_message, is_retryable in failure_patterns:
            if pattern in combined_content:
                logger.debug(f"Detected failure pattern: {pattern} (retryable: {is_retryable})")
                
                # Try to extract a more specific error message
                error_msg = self._extract_error_message(combined_content, pattern)
                if error_msg:
                    return True, error_msg, is_retryable
                elif default_message:
                    return True, default_message, is_retryable
                else:
                    return True, f"Benchmark failed: {pattern}", is_retryable
        
        return False, None, False

    def _extract_error_message(self, content: str, trigger_pattern: str) -> Optional[str]:
        """
        Extract a detailed error message from output content.
        
        Args:
            content: Combined stdout/stderr content
            trigger_pattern: The pattern that triggered failure detection
            
        Returns:
            Extracted error message or None
        """
        lines = content.split('\n')
        
        # Box drawing characters to skip
        box_chars = set('─│╭╮╯╰├┤┬┴┼═╔╗╚╝━┃┏┓┗┛')
        
        error_lines = []
        found_trigger = False
        
        for i, line in enumerate(lines):
            # Skip box drawing lines
            clean_line = line.strip()
            if not clean_line or all(c in box_chars for c in clean_line):
                continue
            
            # Look for the trigger pattern
            if trigger_pattern in line:
                found_trigger = True
                # Collect this line and a few following lines
                for j in range(i, min(i + 5, len(lines))):
                    check_line = lines[j].strip()
                    if check_line and not all(c in box_chars for c in check_line):
                        error_lines.append(check_line)
                break
        
        if error_lines:
            return '\n'.join(error_lines[:3])  # Return first 3 meaningful lines
        
        return None

    async def execute_run(self, run: Run, api_keys: Optional[dict[str, str]] = None) -> None:
        """
        Execute a run asynchronously.
        
        Args:
            run: The run to execute
            api_keys: Optional dict of environment variable names to API key values
                      to inject into the subprocess environment
        """
        logger.info(f"Starting run {run.run_id} for benchmark={run.config.benchmark if run.config else 'N/A'}")
        
        if run.config is None:
            logger.error(f"Run {run.run_id} has no configuration")
            await run_store.update_run(
                run.run_id,
                status=RunStatus.FAILED,
                finished_at=datetime.utcnow(),
                error="No configuration provided",
            )
            return

        # Create artifact directory
        artifact_dir = self._create_artifact_dir(run.run_id)
        
        # Write config
        self._write_config(artifact_dir, run.config)
        
        # Determine command (real or mock)
        is_mock = not self._check_bench_available()
        if is_mock:
            duration = min(run.config.limit or 5, 10)  # Cap at 10 seconds
            cmd = build_mock_command(run.config, duration)
            logger.info(f"Run {run.run_id}: Using mock command (bench CLI not available)")
        else:
            from app.runner.command_builder import build_command
            cmd = build_command(run.config)
            logger.info(f"Run {run.run_id}: Using real bench CLI")
        
        self._write_command(artifact_dir, cmd)
        
        # Write mock indicator file if applicable
        if is_mock:
            with open(artifact_dir / ".mock_run", "w") as f:
                f.write("This run was executed in mock mode (bench CLI not available)\n")
        
        # Update run status to running
        await run_store.update_run(
            run.run_id,
            status=RunStatus.RUNNING,
            started_at=datetime.utcnow(),
            artifact_dir=str(artifact_dir),
        )
        
        # Broadcast status change via WebSocket
        try:
            broadcast = _get_ws_broadcast()
            await broadcast(run.run_id, "status", {
                "status": "running",
                "timestamp": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            logger.debug(f"Run {run.run_id}: WebSocket broadcast failed: {e}")
        
        # Open log files
        stdout_path = artifact_dir / "stdout.log"
        stderr_path = artifact_dir / "stderr.log"
        
        # Build environment with API keys
        env = {**os.environ}
        if api_keys:
            env.update(api_keys)
            logger.debug(f"Run {run.run_id}: Injecting {len(api_keys)} API keys")
        
        # Extract provider from model for retry config
        provider = run.config.model.split("/")[0] if "/" in run.config.model else None
        retry_state = self._get_retry_state(run.run_id, provider)
        total_delay = 0.0
        
        try:
            # Retry loop
            for attempt in range(self.MAX_RETRIES + 1):
                # Check if canceled before starting attempt
                if run.run_id in self._canceled_runs:
                    self._canceled_runs.discard(run.run_id)
                    logger.info(f"Run {run.run_id}: Canceled before attempt {attempt + 1}")
                    await run_store.update_run(
                        run.run_id,
                        status=RunStatus.CANCELED,
                        finished_at=datetime.utcnow(),
                    )
                    self._clear_retry_state(run.run_id)
                    return
                
                # Add delay for retry attempts
                if attempt > 0:
                    delay = calculate_delay(attempt - 1, RetryConfig(base_delay=self.BASE_DELAY))
                    total_delay += delay
                    
                    logger.info(
                        f"Run {run.run_id}: Retry attempt {attempt}/{self.MAX_RETRIES} "
                        f"after {delay:.2f}s delay (total delay: {total_delay:.2f}s)"
                    )
                    
                    # Broadcast retry status
                    await self._broadcast_retry_status(
                        run.run_id,
                        attempt,
                        self.MAX_RETRIES,
                        delay,
                        retry_state.last_error or "Unknown error",
                        total_delay,
                    )
                    
                    await asyncio.sleep(delay)
                
                # Use append mode for retries to preserve previous attempt logs
                write_mode = "a" if attempt > 0 else "w"
                
                with open(stdout_path, write_mode) as stdout_file, open(stderr_path, write_mode) as stderr_file:
                    # Add retry marker to logs
                    if attempt > 0:
                        retry_marker = f"\n\n=== RETRY ATTEMPT {attempt + 1}/{self.MAX_RETRIES + 1} ===\n\n"
                        stdout_file.write(retry_marker)
                        stderr_file.write(retry_marker)
                    
                    # Start subprocess
                    logger.debug(f"Run {run.run_id}: Starting subprocess (attempt {attempt + 1}): {command_to_string(cmd)}")
                    process = subprocess.Popen(
                        cmd,
                        stdout=stdout_file,
                        stderr=stderr_file,
                        cwd=str(artifact_dir),
                        env=env,
                    )
                    
                    self._running_processes[run.run_id] = process
                    logger.info(f"Run {run.run_id}: Process started with PID {process.pid} (attempt {attempt + 1})")
                    
                    # Wait for completion in a thread to not block
                    loop = asyncio.get_event_loop()
                    exit_code = await loop.run_in_executor(None, process.wait)
                    
                    logger.info(f"Run {run.run_id}: Process exited with code {exit_code} (attempt {attempt + 1})")
                    
                    # Remove from running processes
                    self._running_processes.pop(run.run_id, None)
                    
                    # Check if this run was canceled
                    if run.run_id in self._canceled_runs:
                        self._canceled_runs.discard(run.run_id)
                        logger.info(f"Run {run.run_id}: Was canceled, writing meta.json")
                        
                        meta = {
                            "exit_code": exit_code,
                            "finished_at": datetime.utcnow().isoformat(),
                            "status": RunStatus.CANCELED.value,
                            "mock_run": is_mock,
                            "retry_attempts": attempt,
                            "total_retry_delay": round(total_delay, 2),
                        }
                        with open(artifact_dir / "meta.json", "w") as f:
                            json.dump(meta, f, indent=2)
                        self._clear_retry_state(run.run_id)
                        return
                
                # Read output for failure detection
                with open(stdout_path, "r") as f:
                    stdout_content = f.read()
                with open(stderr_path, "r") as f:
                    stderr_content = f.read()
                
                # Detect failures from output content
                detected_failure, error, is_retryable = self._detect_failure(stdout_content, stderr_content)
                
                # Determine status and whether to retry
                if exit_code == 0 and not detected_failure:
                    # Success!
                    status = RunStatus.COMPLETED
                    error = None
                    if attempt > 0:
                        logger.info(f"Run {run.run_id}: Completed successfully after {attempt} retries (total delay: {total_delay:.2f}s)")
                    else:
                        logger.info(f"Run {run.run_id}: Completed successfully")
                    break
                    
                elif exit_code == 130:
                    # SIGINT/SIGTERM - was canceled, don't retry
                    status = RunStatus.CANCELED
                    error = "Run was canceled"
                    logger.info(f"Run {run.run_id}: Canceled (exit code 130)")
                    break
                    
                elif is_retryable and attempt < self.MAX_RETRIES:
                    # Retryable error, will retry
                    error_msg = error or f"Process exited with code {exit_code}"
                    retry_state.start_retry(error_msg)
                    logger.warning(
                        f"Run {run.run_id}: Retryable error on attempt {attempt + 1}/{self.MAX_RETRIES + 1}: {error_msg}"
                    )
                    continue
                    
                else:
                    # Non-retryable error or max retries reached
                    status = RunStatus.FAILED
                    if not error:
                        error = stderr_content[-1000:] if stderr_content else f"Process exited with code {exit_code}"
                    
                    if attempt > 0:
                        error = f"{error} (failed after {attempt + 1} attempts)"
                        logger.error(
                            f"Run {run.run_id}: Failed after {attempt + 1} attempts "
                            f"(total delay: {total_delay:.2f}s): {error}"
                        )
                    else:
                        logger.warning(f"Run {run.run_id}: Failed with exit code {exit_code}: {error}")
                    break
            
            # Parse and write summary.json
            primary_metric_value: Optional[float] = None
            primary_metric_name: Optional[str] = None
            try:
                summary = parse_and_write_summary(artifact_dir)
                if summary.primary_metric:
                    primary_metric_value = summary.primary_metric.value
                    primary_metric_name = summary.primary_metric.name
                    logger.info(f"Run {run.run_id}: Parsed primary metric {primary_metric_name}={primary_metric_value}")
            except Exception as e:
                logger.warning(f"Run {run.run_id}: Summary parsing failed: {e}")
            
            # Write meta.json with retry info
            meta = {
                "exit_code": exit_code,
                "finished_at": datetime.utcnow().isoformat(),
                "status": status.value,
                "mock_run": is_mock,
                "retry_attempts": retry_state.current_attempt,
                "total_retry_delay": round(total_delay, 2),
            }
            with open(artifact_dir / "meta.json", "w") as f:
                json.dump(meta, f, indent=2)
            
            await run_store.update_run(
                run.run_id,
                status=status,
                finished_at=datetime.utcnow(),
                exit_code=exit_code,
                error=error,
                primary_metric=primary_metric_value,
                primary_metric_name=primary_metric_name,
            )
            
            # Broadcast final status via WebSocket
            try:
                broadcast = _get_ws_broadcast()
                event_type = status.value if hasattr(status, 'value') else str(status)
                await broadcast(run.run_id, event_type, {
                    "exit_code": exit_code,
                    "error": error,
                    "finished_at": datetime.utcnow().isoformat(),
                    "retry_attempts": retry_state.current_attempt,
                    "total_retry_delay": round(total_delay, 2),
                })
            except Exception as e:
                logger.debug(f"Run {run.run_id}: WebSocket broadcast failed: {e}")
            
            # Send webhook notification if user has it configured
            if run.user_id and status in (RunStatus.COMPLETED, RunStatus.FAILED):
                try:
                    # Calculate duration
                    duration_seconds = None
                    if run.started_at:
                        started_at = run.started_at if isinstance(run.started_at, datetime) else datetime.fromisoformat(str(run.started_at))
                        duration_seconds = int((datetime.utcnow() - started_at).total_seconds())
                    
                    await notification_service.send_run_notification(
                        user_id=run.user_id,
                        run_id=run.run_id,
                        benchmark=run.benchmark,
                        model=run.model,
                        status=status.value,
                        score=primary_metric_value,
                        duration_seconds=duration_seconds,
                        error=error,
                    )
                except Exception as e:
                    logger.warning(f"Run {run.run_id}: Webhook notification failed: {e}")
            
            # Clear retry state
            self._clear_retry_state(run.run_id)
                
        except FileNotFoundError as e:
            logger.error(f"Run {run.run_id}: Command not found: {e}")
            self._running_processes.pop(run.run_id, None)
            self._clear_retry_state(run.run_id)
            error_msg = f"Command not found: {e}. Make sure Python is installed."
            await run_store.update_run(
                run.run_id,
                status=RunStatus.FAILED,
                finished_at=datetime.utcnow(),
                error=error_msg,
            )
            # Send failure notification
            if run.user_id:
                try:
                    await notification_service.send_run_notification(
                        user_id=run.user_id,
                        run_id=run.run_id,
                        benchmark=run.benchmark,
                        model=run.model,
                        status="failed",
                        error=error_msg,
                    )
                except Exception as notify_err:
                    logger.warning(f"Run {run.run_id}: Webhook notification failed: {notify_err}")
        except Exception as e:
            logger.error(f"Run {run.run_id}: Unexpected error: {e}", exc_info=True)
            self._running_processes.pop(run.run_id, None)
            self._clear_retry_state(run.run_id)
            error_msg = str(e)
            await run_store.update_run(
                run.run_id,
                status=RunStatus.FAILED,
                finished_at=datetime.utcnow(),
                error=error_msg,
            )
            # Send failure notification
            if run.user_id:
                try:
                    await notification_service.send_run_notification(
                        user_id=run.user_id,
                        run_id=run.run_id,
                        benchmark=run.benchmark,
                        model=run.model,
                        status="failed",
                        error=error_msg,
                    )
                except Exception as notify_err:
                    logger.warning(f"Run {run.run_id}: Webhook notification failed: {notify_err}")

    async def cancel_run(self, run_id: str) -> bool:
        """
        Cancel a running process.
        
        Args:
            run_id: ID of the run to cancel
            
        Returns:
            True if the run was found and canceled, False otherwise
        """
        process = self._running_processes.get(run_id)
        if process is None:
            logger.warning(f"Cancel requested for run {run_id} but no running process found")
            return False
        
        logger.info(f"Canceling run {run_id} (PID {process.pid})")
        
        # Mark as canceled before terminating to prevent race condition
        self._canceled_runs.add(run_id)
        
        try:
            process.terminate()
            logger.debug(f"Run {run_id}: Sent SIGTERM")
            try:
                process.wait(timeout=5)
                logger.debug(f"Run {run_id}: Process terminated gracefully")
            except subprocess.TimeoutExpired:
                logger.warning(f"Run {run_id}: Process didn't terminate, sending SIGKILL")
                process.kill()
                process.wait()
        except (PermissionError, OSError) as e:
            logger.warning(f"Run {run_id}: Could not terminate process: {e}")
            # Still mark as canceled
        
        self._running_processes.pop(run_id, None)
        
        await run_store.update_run(
            run_id,
            status=RunStatus.CANCELED,
            finished_at=datetime.utcnow(),
        )
        
        # Broadcast cancel via WebSocket
        try:
            broadcast = _get_ws_broadcast()
            await broadcast(run_id, "canceled", {
                "finished_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            logger.debug(f"Run {run_id}: WebSocket broadcast failed: {e}")
        
        logger.info(f"Run {run_id}: Canceled successfully")
        return True

    def get_running_runs(self) -> list[str]:
        """Return list of currently running run IDs."""
        return list(self._running_processes.keys())

    def get_run_process(self, run_id: str) -> Optional[subprocess.Popen]:
        """Get the subprocess for a running run (for debugging)."""
        return self._running_processes.get(run_id)


# Global instance
executor = RunExecutor()
