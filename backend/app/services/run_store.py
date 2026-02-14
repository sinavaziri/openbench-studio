import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import RUNS_DIR
from app.db.session import get_db
from app.db.models import Run, RunConfig, RunCreate, RunStatus, RunSummary


class RunStore:
    """Service for storing and retrieving runs from SQLite."""

    async def create_run(self, run_create: RunCreate, user_id: Optional[str] = None) -> Run:
        """Create a new run and store it in the database."""
        config = RunConfig(**run_create.model_dump())
        run = Run(
            benchmark=run_create.benchmark,
            model=run_create.model,
            config=config,
            user_id=user_id,
        )
        
        async with get_db() as db:
            await db.execute(
                """
                INSERT INTO runs (
                    run_id, user_id, benchmark, model, status, created_at,
                    started_at, finished_at, artifact_dir, exit_code, error, config_json, tags_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run.run_id,
                    run.user_id,
                    run.benchmark,
                    run.model,
                    run.status.value,
                    run.created_at.isoformat(),
                    None,
                    None,
                    run.artifact_dir,
                    run.exit_code,
                    run.error,
                    config.model_dump_json(),
                    json.dumps(run.tags),
                ),
            )
            await db.commit()
        
        return run

    async def get_run(self, run_id: str, user_id: Optional[str] = None) -> Optional[Run]:
        """
        Get a run by ID.
        
        If user_id is provided, only returns the run if it belongs to that user
        or if the run has no owner (legacy runs).
        """
        async with get_db() as db:
            if user_id is not None:
                cursor = await db.execute(
                    "SELECT * FROM runs WHERE run_id = ? AND (user_id = ? OR user_id IS NULL)",
                    (run_id, user_id),
                )
            else:
                cursor = await db.execute(
                    "SELECT * FROM runs WHERE run_id = ?", (run_id,)
                )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_run(row)

    async def list_runs(
        self,
        limit: int = 50,
        user_id: Optional[str] = None,
        search: Optional[str] = None,
        status: Optional[str] = None,
        benchmark: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[RunSummary]:
        """
        List recent runs with optional filtering.
        
        Args:
            limit: Maximum number of runs to return
            user_id: Filter by user (also shows legacy runs with no owner)
            search: Search in benchmark and model names
            status: Filter by status (queued, running, completed, failed, canceled)
            benchmark: Filter by exact benchmark name
            tag: Filter by tag (runs containing this tag)
        """
        conditions = []
        params: list = []
        
        # User filter (always show legacy runs too)
        if user_id is not None:
            conditions.append("(user_id = ? OR user_id IS NULL)")
            params.append(user_id)
        
        # Search filter (benchmark or model)
        if search:
            conditions.append("(benchmark LIKE ? OR model LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])
        
        # Status filter
        if status:
            conditions.append("status = ?")
            params.append(status)
        
        # Benchmark filter
        if benchmark:
            conditions.append("benchmark = ?")
            params.append(benchmark)
        
        # Tag filter (JSON contains)
        if tag:
            conditions.append("tags_json LIKE ?")
            params.append(f'%"{tag}"%')
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        query = f"SELECT * FROM runs WHERE {where_clause} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        async with get_db() as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            return [self._row_to_summary(row) for row in rows]

    async def update_run(
        self,
        run_id: str,
        status: Optional[RunStatus] = None,
        started_at: Optional[datetime] = None,
        finished_at: Optional[datetime] = None,
        artifact_dir: Optional[str] = None,
        exit_code: Optional[int] = None,
        error: Optional[str] = None,
        primary_metric: Optional[float] = None,
        primary_metric_name: Optional[str] = None,
    ) -> Optional[Run]:
        """Update a run's fields."""
        updates = []
        params = []
        
        if status is not None:
            updates.append("status = ?")
            params.append(status.value)
        if started_at is not None:
            updates.append("started_at = ?")
            params.append(started_at.isoformat())
        if finished_at is not None:
            updates.append("finished_at = ?")
            params.append(finished_at.isoformat())
        if artifact_dir is not None:
            updates.append("artifact_dir = ?")
            params.append(artifact_dir)
        if exit_code is not None:
            updates.append("exit_code = ?")
            params.append(exit_code)
        if error is not None:
            updates.append("error = ?")
            params.append(error)
        if primary_metric is not None:
            updates.append("primary_metric = ?")
            params.append(primary_metric)
        if primary_metric_name is not None:
            updates.append("primary_metric_name = ?")
            params.append(primary_metric_name)
        
        if not updates:
            return await self.get_run(run_id)
        
        params.append(run_id)
        query = f"UPDATE runs SET {', '.join(updates)} WHERE run_id = ?"
        
        async with get_db() as db:
            await db.execute(query, params)
            await db.commit()
        
        return await self.get_run(run_id)

    async def delete_run(self, run_id: str, user_id: Optional[str] = None) -> bool:
        """
        Delete a run and its artifacts.
        
        Args:
            run_id: The run ID to delete
            user_id: If provided, only deletes if user owns the run
            
        Returns:
            True if run was deleted, False if not found or not authorized
        """
        # First check the run exists and user has access
        run = await self.get_run(run_id, user_id=user_id)
        if run is None:
            return False
        
        # Don't delete running runs
        if run.status == RunStatus.RUNNING:
            return False
        
        # Delete from database
        async with get_db() as db:
            if user_id is not None:
                await db.execute(
                    "DELETE FROM runs WHERE run_id = ? AND (user_id = ? OR user_id IS NULL)",
                    (run_id, user_id),
                )
            else:
                await db.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
            await db.commit()
        
        # Delete artifact directory if it exists
        artifact_path = RUNS_DIR / run_id
        if artifact_path.exists():
            shutil.rmtree(artifact_path, ignore_errors=True)
        
        return True

    async def update_tags(self, run_id: str, tags: list[str], user_id: Optional[str] = None) -> Optional[Run]:
        """
        Update tags for a run.
        
        Args:
            run_id: The run ID to update
            tags: New list of tags
            user_id: If provided, only updates if user owns the run
            
        Returns:
            Updated run or None if not found/authorized
        """
        # Check the run exists and user has access
        run = await self.get_run(run_id, user_id=user_id)
        if run is None:
            return None
        
        # Normalize tags (lowercase, unique, sorted)
        normalized_tags = sorted(set(tag.lower().strip() for tag in tags if tag.strip()))
        
        async with get_db() as db:
            if user_id is not None:
                await db.execute(
                    "UPDATE runs SET tags_json = ? WHERE run_id = ? AND (user_id = ? OR user_id IS NULL)",
                    (json.dumps(normalized_tags), run_id, user_id),
                )
            else:
                await db.execute(
                    "UPDATE runs SET tags_json = ? WHERE run_id = ?",
                    (json.dumps(normalized_tags), run_id),
                )
            await db.commit()
        
        return await self.get_run(run_id, user_id=user_id)

    async def update_notes(self, run_id: str, notes: Optional[str], user_id: Optional[str] = None) -> Optional[Run]:
        """
        Update notes for a run.
        
        Args:
            run_id: The run ID to update
            notes: New notes content (can be None to clear)
            user_id: If provided, only updates if user owns the run
            
        Returns:
            Updated run or None if not found/authorized
        """
        # Check the run exists and user has access
        run = await self.get_run(run_id, user_id=user_id)
        if run is None:
            return None
        
        # Trim whitespace and allow empty string to clear notes
        cleaned_notes = notes.strip() if notes else None
        
        async with get_db() as db:
            if user_id is not None:
                await db.execute(
                    "UPDATE runs SET notes = ? WHERE run_id = ? AND (user_id = ? OR user_id IS NULL)",
                    (cleaned_notes, run_id, user_id),
                )
            else:
                await db.execute(
                    "UPDATE runs SET notes = ? WHERE run_id = ?",
                    (cleaned_notes, run_id),
                )
            await db.commit()
        
        return await self.get_run(run_id, user_id=user_id)

    async def get_all_tags(self, user_id: Optional[str] = None) -> list[str]:
        """Get all unique tags across all runs for a user."""
        async with get_db() as db:
            if user_id is not None:
                cursor = await db.execute(
                    "SELECT DISTINCT tags_json FROM runs WHERE (user_id = ? OR user_id IS NULL) AND tags_json IS NOT NULL",
                    (user_id,),
                )
            else:
                cursor = await db.execute(
                    "SELECT DISTINCT tags_json FROM runs WHERE tags_json IS NOT NULL"
                )
            rows = await cursor.fetchall()
        
        all_tags = set()
        for row in rows:
            if row["tags_json"]:
                try:
                    tags = json.loads(row["tags_json"])
                    all_tags.update(tags)
                except json.JSONDecodeError:
                    pass
        
        return sorted(all_tags)

    def _parse_tags(self, row) -> list[str]:
        """Parse tags from a database row."""
        tags_json = row.get("tags_json") if hasattr(row, "get") else (row["tags_json"] if "tags_json" in row.keys() else None)
        if tags_json:
            try:
                return json.loads(tags_json)
            except json.JSONDecodeError:
                pass
        return []

    def _row_to_run(self, row) -> Run:
        """Convert a database row to a Run model."""
        config = None
        if row["config_json"]:
            config = RunConfig(**json.loads(row["config_json"]))
        
        # Safely get notes column (may not exist in older databases)
        notes = None
        try:
            notes = row["notes"]
        except (KeyError, IndexError):
            pass
        
        return Run(
            run_id=row["run_id"],
            user_id=row["user_id"],
            benchmark=row["benchmark"],
            model=row["model"],
            status=RunStatus(row["status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
            finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
            artifact_dir=row["artifact_dir"],
            exit_code=row["exit_code"],
            error=row["error"],
            config=config,
            primary_metric=row["primary_metric"],
            primary_metric_name=row["primary_metric_name"],
            tags=self._parse_tags(row),
            notes=notes,
        )

    def _row_to_summary(self, row) -> RunSummary:
        """Convert a database row to a RunSummary model."""
        # Safely get notes column (may not exist in older databases)
        notes = None
        try:
            notes = row["notes"]
        except (KeyError, IndexError):
            pass
        
        return RunSummary(
            run_id=row["run_id"],
            benchmark=row["benchmark"],
            model=row["model"],
            status=RunStatus(row["status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
            primary_metric=row["primary_metric"],
            primary_metric_name=row["primary_metric_name"],
            tags=self._parse_tags(row),
            notes=notes,
        )


# Global instance
run_store = RunStore()

