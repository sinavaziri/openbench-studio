"""
Run scheduler service.

Runs as a background task that periodically checks for scheduled runs
that are due for execution and starts them.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


class RunScheduler:
    """
    Background scheduler that executes scheduled benchmark runs.
    
    Polls the database every N seconds for runs where scheduled_for <= now
    and starts them automatically.
    """
    
    def __init__(self, check_interval: int = 30):
        """
        Initialize the scheduler.
        
        Args:
            check_interval: Seconds between checks for due runs (default: 30)
        """
        self.check_interval = check_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the scheduler background task."""
        if self._running:
            logger.warning("Scheduler already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info(f"Run scheduler started (check interval: {self.check_interval}s)")
    
    async def stop(self):
        """Stop the scheduler background task."""
        if not self._running:
            return
        
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Run scheduler stopped")
    
    async def _scheduler_loop(self):
        """Main scheduler loop - runs forever until stopped."""
        # Import here to avoid circular imports
        from app.services.run_store import run_store
        from app.services.api_keys import api_key_service
        from app.runner.executor import executor
        
        while self._running:
            try:
                await self._check_and_execute_due_runs(run_store, api_key_service, executor)
            except Exception as e:
                logger.error(f"Scheduler error: {e}", exc_info=True)
            
            # Wait before next check
            await asyncio.sleep(self.check_interval)
    
    async def _check_and_execute_due_runs(self, run_store, api_key_service, executor):
        """Check for due scheduled runs and execute them."""
        due_runs = await run_store.get_due_scheduled_runs()
        
        if due_runs:
            logger.info(f"Found {len(due_runs)} scheduled run(s) ready to execute")
        
        for run in due_runs:
            try:
                logger.info(f"Starting scheduled run {run.run_id} (scheduled for {run.scheduled_for})")
                
                # Get API keys for the user
                env_vars = {}
                if run.user_id:
                    env_vars = await api_key_service.get_decrypted_keys_for_run(run.user_id)
                
                # Clear scheduled_for since we're executing now
                await run_store.update_run(run.run_id, scheduled_for=None)
                
                # Start execution (non-blocking - runs in background)
                asyncio.create_task(executor.execute_run(run, env_vars))
                
            except Exception as e:
                logger.error(f"Failed to start scheduled run {run.run_id}: {e}", exc_info=True)
                # Update run with error
                from app.db.models import RunStatus
                await run_store.update_run(
                    run.run_id,
                    status=RunStatus.FAILED,
                    finished_at=datetime.utcnow(),
                    error=f"Scheduler failed to start run: {e}",
                )
    
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._running


# Global scheduler instance
scheduler = RunScheduler(check_interval=30)
