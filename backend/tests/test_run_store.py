"""
Tests for the run store service.

Tests cover:
- Creating runs
- Updating run status
- Getting run results
- Listing and filtering runs
- Run deletion
- Tag management
"""

import os
from datetime import datetime

import pytest

# Set test environment before imports
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only-32"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32-chars-xxx"

from app.services.run_store import RunStore
from app.db.models import RunCreate, RunStatus


class TestRunCreation:
    """Tests for creating benchmark runs."""

    @pytest.mark.asyncio
    async def test_create_run_minimal(self, test_db):
        """Should create run with minimal required fields."""
        run_store = RunStore()
        run_create = RunCreate(benchmark="mmlu", model="gpt-4")
        
        run = await run_store.create_run(run_create)
        
        assert run is not None
        assert run.benchmark == "mmlu"
        assert run.model == "gpt-4"
        assert run.status == RunStatus.QUEUED
        assert run.run_id is not None
        assert run.created_at is not None

    @pytest.mark.asyncio
    async def test_create_run_with_config(self, test_db, sample_run_data):
        """Should create run with full configuration."""
        run_store = RunStore()
        run_create = RunCreate(**sample_run_data)
        
        run = await run_store.create_run(run_create)
        
        assert run is not None
        assert run.benchmark == sample_run_data["benchmark"]
        assert run.model == sample_run_data["model"]
        assert run.config is not None
        assert run.config.limit == sample_run_data["limit"]
        assert run.config.temperature == sample_run_data["temperature"]

    @pytest.mark.asyncio
    async def test_create_run_with_user_id(self, test_db):
        """Should create run with user ownership."""
        run_store = RunStore()
        run_create = RunCreate(benchmark="gsm8k", model="claude-3")
        user_id = "user-123"
        
        run = await run_store.create_run(run_create, user_id=user_id)
        
        assert run is not None
        assert run.user_id == user_id

    @pytest.mark.asyncio
    async def test_create_multiple_runs(self, test_db):
        """Should create multiple independent runs."""
        run_store = RunStore()
        
        run1 = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        run2 = await run_store.create_run(RunCreate(benchmark="gsm8k", model="claude-3"))
        
        assert run1.run_id != run2.run_id
        assert run1.benchmark != run2.benchmark


class TestRunRetrieval:
    """Tests for retrieving runs."""

    @pytest.mark.asyncio
    async def test_get_run_by_id(self, test_db):
        """Should retrieve run by ID."""
        run_store = RunStore()
        run_create = RunCreate(benchmark="mmlu", model="gpt-4")
        
        created = await run_store.create_run(run_create)
        retrieved = await run_store.get_run(created.run_id)
        
        assert retrieved is not None
        assert retrieved.run_id == created.run_id
        assert retrieved.benchmark == "mmlu"

    @pytest.mark.asyncio
    async def test_get_run_nonexistent(self, test_db):
        """Should return None for non-existent run."""
        run_store = RunStore()
        
        retrieved = await run_store.get_run("nonexistent-run-id")
        
        assert retrieved is None

    @pytest.mark.asyncio
    async def test_get_run_with_user_filter(self, test_db):
        """Should filter runs by user ownership."""
        run_store = RunStore()
        user1_id = "user-1"
        user2_id = "user-2"
        
        # Create runs for different users
        run1 = await run_store.create_run(
            RunCreate(benchmark="mmlu", model="gpt-4"),
            user_id=user1_id
        )
        run2 = await run_store.create_run(
            RunCreate(benchmark="gsm8k", model="claude-3"),
            user_id=user2_id
        )
        
        # User1 can only see their own run
        user1_run = await run_store.get_run(run1.run_id, user_id=user1_id)
        assert user1_run is not None
        
        # User1 cannot see User2's run
        user2_run_as_user1 = await run_store.get_run(run2.run_id, user_id=user1_id)
        assert user2_run_as_user1 is None


class TestRunUpdates:
    """Tests for updating runs."""

    @pytest.mark.asyncio
    async def test_update_run_status(self, test_db):
        """Should update run status."""
        run_store = RunStore()
        run_create = RunCreate(benchmark="mmlu", model="gpt-4")
        
        run = await run_store.create_run(run_create)
        assert run.status == RunStatus.QUEUED
        
        # Update to running
        updated = await run_store.update_run(run.run_id, status=RunStatus.RUNNING)
        assert updated.status == RunStatus.RUNNING
        
        # Update to completed
        updated = await run_store.update_run(run.run_id, status=RunStatus.COMPLETED)
        assert updated.status == RunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_update_run_started_at(self, test_db):
        """Should update run started_at timestamp."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        started = datetime.utcnow()
        updated = await run_store.update_run(
            run.run_id,
            status=RunStatus.RUNNING,
            started_at=started
        )
        
        assert updated.started_at is not None

    @pytest.mark.asyncio
    async def test_update_run_completion(self, test_db):
        """Should update run with completion data."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        finished = datetime.utcnow()
        updated = await run_store.update_run(
            run.run_id,
            status=RunStatus.COMPLETED,
            finished_at=finished,
            exit_code=0,
            primary_metric=0.85,
            primary_metric_name="accuracy"
        )
        
        assert updated.status == RunStatus.COMPLETED
        assert updated.finished_at is not None
        assert updated.exit_code == 0
        assert updated.primary_metric == 0.85
        assert updated.primary_metric_name == "accuracy"

    @pytest.mark.asyncio
    async def test_update_run_failure(self, test_db):
        """Should update run with failure data."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        updated = await run_store.update_run(
            run.run_id,
            status=RunStatus.FAILED,
            exit_code=1,
            error="Model API returned an error"
        )
        
        assert updated.status == RunStatus.FAILED
        assert updated.exit_code == 1
        assert updated.error == "Model API returned an error"


class TestRunListing:
    """Tests for listing and filtering runs."""

    @pytest.mark.asyncio
    async def test_list_runs_empty(self, test_db):
        """Should return empty list when no runs exist."""
        run_store = RunStore()
        
        runs = await run_store.list_runs()
        
        assert runs == []

    @pytest.mark.asyncio
    async def test_list_runs_with_limit(self, test_db):
        """Should respect limit parameter."""
        run_store = RunStore()
        
        # Create 5 runs
        for i in range(5):
            await run_store.create_run(RunCreate(benchmark=f"bench{i}", model="gpt-4"))
        
        # Request only 3
        runs = await run_store.list_runs(limit=3)
        
        assert len(runs) == 3

    @pytest.mark.asyncio
    async def test_list_runs_by_status(self, test_db):
        """Should filter runs by status."""
        run_store = RunStore()
        
        # Create runs with different statuses
        run1 = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        run2 = await run_store.create_run(RunCreate(benchmark="gsm8k", model="claude-3"))
        
        await run_store.update_run(run1.run_id, status=RunStatus.COMPLETED)
        
        # Filter by completed
        completed = await run_store.list_runs(status="completed")
        assert len(completed) == 1
        assert completed[0].run_id == run1.run_id
        
        # Filter by queued
        queued = await run_store.list_runs(status="queued")
        assert len(queued) == 1
        assert queued[0].run_id == run2.run_id

    @pytest.mark.asyncio
    async def test_list_runs_by_benchmark(self, test_db):
        """Should filter runs by benchmark name."""
        run_store = RunStore()
        
        await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        await run_store.create_run(RunCreate(benchmark="gsm8k", model="gpt-4"))
        await run_store.create_run(RunCreate(benchmark="mmlu", model="claude-3"))
        
        mmlu_runs = await run_store.list_runs(benchmark="mmlu")
        
        assert len(mmlu_runs) == 2
        assert all(r.benchmark == "mmlu" for r in mmlu_runs)

    @pytest.mark.asyncio
    async def test_list_runs_search(self, test_db):
        """Should search in benchmark and model names."""
        run_store = RunStore()
        
        await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        await run_store.create_run(RunCreate(benchmark="gsm8k", model="claude-3"))
        
        # Search by model
        gpt_runs = await run_store.list_runs(search="gpt")
        assert len(gpt_runs) == 1
        assert gpt_runs[0].model == "gpt-4"
        
        # Search by benchmark
        gsm_runs = await run_store.list_runs(search="gsm")
        assert len(gsm_runs) == 1
        assert gsm_runs[0].benchmark == "gsm8k"


class TestRunDeletion:
    """Tests for deleting runs."""

    @pytest.mark.asyncio
    async def test_delete_run_success(self, test_db):
        """Should delete a run successfully."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        result = await run_store.delete_run(run.run_id)
        
        assert result is True
        assert await run_store.get_run(run.run_id) is None

    @pytest.mark.asyncio
    async def test_delete_run_nonexistent(self, test_db):
        """Should return False for non-existent run."""
        run_store = RunStore()
        
        result = await run_store.delete_run("nonexistent-id")
        
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_running_run(self, test_db):
        """Should not delete a running run."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        await run_store.update_run(run.run_id, status=RunStatus.RUNNING)
        
        result = await run_store.delete_run(run.run_id)
        
        assert result is False
        assert await run_store.get_run(run.run_id) is not None


class TestRunTags:
    """Tests for run tag management."""

    @pytest.mark.asyncio
    async def test_update_tags(self, test_db):
        """Should update run tags."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        updated = await run_store.update_tags(run.run_id, ["experiment", "baseline"])
        
        assert updated is not None
        assert "experiment" in updated.tags
        assert "baseline" in updated.tags

    @pytest.mark.asyncio
    async def test_tags_normalized(self, test_db):
        """Should normalize tags (lowercase, unique, sorted)."""
        run_store = RunStore()
        run = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        
        updated = await run_store.update_tags(run.run_id, ["Experiment", "BASELINE", "experiment"])
        
        assert updated.tags == ["baseline", "experiment"]

    @pytest.mark.asyncio
    async def test_get_all_tags(self, test_db):
        """Should get all unique tags across runs."""
        run_store = RunStore()
        
        run1 = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        run2 = await run_store.create_run(RunCreate(benchmark="gsm8k", model="claude-3"))
        
        await run_store.update_tags(run1.run_id, ["experiment", "v1"])
        await run_store.update_tags(run2.run_id, ["experiment", "v2"])
        
        all_tags = await run_store.get_all_tags()
        
        assert "experiment" in all_tags
        assert "v1" in all_tags
        assert "v2" in all_tags

    @pytest.mark.asyncio
    async def test_filter_by_tag(self, test_db):
        """Should filter runs by tag."""
        run_store = RunStore()
        
        run1 = await run_store.create_run(RunCreate(benchmark="mmlu", model="gpt-4"))
        run2 = await run_store.create_run(RunCreate(benchmark="gsm8k", model="claude-3"))
        
        await run_store.update_tags(run1.run_id, ["production"])
        await run_store.update_tags(run2.run_id, ["test"])
        
        prod_runs = await run_store.list_runs(tag="production")
        
        assert len(prod_runs) == 1
        assert prod_runs[0].run_id == run1.run_id
