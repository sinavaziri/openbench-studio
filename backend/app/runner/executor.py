"""
Benchmark run executor.

Executes benchmark runs as subprocesses, handling:
- Real `bench` CLI when available
- Mock mode for development/testing
- Graceful cancellation
- Output parsing and result storage
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
from app.db.models import Run, RunConfig, RunStatus
from app.runner.command_builder import build_mock_command, command_to_string
from app.runner.summary_parser import parse_and_write_summary
from app.services.run_store import run_store

# Configure logging
logger = logging.getLogger(__name__)


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
    """

    def __init__(self):
        self._running_processes: dict[str, subprocess.Popen] = {}
        self._canceled_runs: set[str] = set()
        self._mock_mode: Optional[bool] = None
        
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

    def _detect_failure(self, stdout_content: str, stderr_content: str) -> tuple[bool, Optional[str]]:
        """
        Detect benchmark failures from output content.
        
        The bench CLI sometimes returns exit code 0 even when tasks fail,
        so we need to inspect the output for error patterns.
        
        Args:
            stdout_content: Content from stdout.log
            stderr_content: Content from stderr.log
            
        Returns:
            Tuple of (is_failure, error_message)
        """
        failure_patterns = [
            ("Task interrupted (no samples completed", "Benchmark interrupted - no samples completed"),
            ("Error code:", None),  # Extract actual error
            ("NotFoundError:", "Model not found or access denied"),
            ("does not exist or you do not have access", "Model not found or access denied"),
            ("model_not_found", "Model not found"),
            ("AuthenticationError:", "Authentication failed - check API key"),
            ("PermissionDeniedError:", "Permission denied - check API key permissions"),
            ("RateLimitError:", "Rate limit exceeded - try again later"),
            ("InsufficientQuotaError:", "Insufficient API quota"),
            ("InvalidRequestError:", "Invalid request parameters"),
            ("[CANCELED]", "Run was canceled by user"),
        ]
        
        combined_content = stdout_content + "\n" + stderr_content
        
        for pattern, default_message in failure_patterns:
            if pattern in combined_content:
                logger.debug(f"Detected failure pattern: {pattern}")
                
                # Try to extract a more specific error message
                error_msg = self._extract_error_message(combined_content, pattern)
                if error_msg:
                    return True, error_msg
                elif default_message:
                    return True, default_message
                else:
                    return True, f"Benchmark failed: {pattern}"
        
        return False, None

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
        
        # Open log files
        stdout_path = artifact_dir / "stdout.log"
        stderr_path = artifact_dir / "stderr.log"
        
        # Build environment with API keys
        env = {**os.environ}
        if api_keys:
            env.update(api_keys)
            logger.debug(f"Run {run.run_id}: Injecting {len(api_keys)} API keys")
        
        try:
            with open(stdout_path, "w") as stdout_file, open(stderr_path, "w") as stderr_file:
                # Start subprocess
                logger.debug(f"Run {run.run_id}: Starting subprocess: {command_to_string(cmd)}")
                process = subprocess.Popen(
                    cmd,
                    stdout=stdout_file,
                    stderr=stderr_file,
                    cwd=str(artifact_dir),
                    env=env,
                )
                
                self._running_processes[run.run_id] = process
                logger.info(f"Run {run.run_id}: Process started with PID {process.pid}")
                
                # Wait for completion in a thread to not block
                loop = asyncio.get_event_loop()
                exit_code = await loop.run_in_executor(None, process.wait)
                
                logger.info(f"Run {run.run_id}: Process exited with code {exit_code}")
                
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
                    }
                    with open(artifact_dir / "meta.json", "w") as f:
                        json.dump(meta, f, indent=2)
                    return
                
                # Read output for failure detection
                with open(stdout_path, "r") as f:
                    stdout_content = f.read()
                with open(stderr_path, "r") as f:
                    stderr_content = f.read()
                
                # Detect failures from output content
                detected_failure, error = self._detect_failure(stdout_content, stderr_content)
                
                # Determine final status
                if exit_code == 0 and not detected_failure:
                    status = RunStatus.COMPLETED
                    error = None
                    logger.info(f"Run {run.run_id}: Completed successfully")
                elif exit_code == 130:
                    # SIGINT/SIGTERM - was canceled
                    status = RunStatus.CANCELED
                    error = "Run was canceled"
                    logger.info(f"Run {run.run_id}: Canceled (exit code 130)")
                elif exit_code == 0 and detected_failure:
                    status = RunStatus.FAILED
                    error = error or "Benchmark failed but returned exit code 0"
                    logger.warning(f"Run {run.run_id}: Failed (detected from output): {error}")
                else:
                    status = RunStatus.FAILED
                    if not error:
                        error = stderr_content[-1000:] if stderr_content else f"Process exited with code {exit_code}"
                    logger.warning(f"Run {run.run_id}: Failed with exit code {exit_code}: {error}")
                
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
                
                # Write meta.json
                meta = {
                    "exit_code": exit_code,
                    "finished_at": datetime.utcnow().isoformat(),
                    "status": status.value,
                    "mock_run": is_mock,
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
                
        except FileNotFoundError as e:
            logger.error(f"Run {run.run_id}: Command not found: {e}")
            self._running_processes.pop(run.run_id, None)
            await run_store.update_run(
                run.run_id,
                status=RunStatus.FAILED,
                finished_at=datetime.utcnow(),
                error=f"Command not found: {e}. Make sure Python is installed.",
            )
        except Exception as e:
            logger.error(f"Run {run.run_id}: Unexpected error: {e}", exc_info=True)
            self._running_processes.pop(run.run_id, None)
            await run_store.update_run(
                run.run_id,
                status=RunStatus.FAILED,
                finished_at=datetime.utcnow(),
                error=str(e),
            )

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
