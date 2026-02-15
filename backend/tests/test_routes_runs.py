"""
Tests for run management API routes.

Tests cover:
- Create run
- List runs
- Get run details
- Cancel run
- Delete run
- Bulk delete runs
- Update run tags
- Update run notes
- Duplicate run
- Scheduled runs
"""

import pytest
from unittest.mock import patch, AsyncMock


class TestCreateRunEndpoint:
    """Tests for POST /api/runs endpoint."""

    @pytest.mark.asyncio
    async def test_create_run_success(self, authenticated_client, mock_executor):
        """Should create a new run."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data

    @pytest.mark.asyncio
    async def test_create_run_with_options(self, authenticated_client, mock_executor):
        """Should create run with optional parameters."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "limit": 100,
            "temperature": 0.5,
            "epochs": 2
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data

    @pytest.mark.asyncio
    async def test_create_run_missing_benchmark(self, authenticated_client):
        """Should reject request without benchmark."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs", json={
            "model": "openai/gpt-4o"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_run_missing_model(self, authenticated_client):
        """Should reject request without model."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs", json={
            "benchmark": "mmlu"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_run_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        
        assert response.status_code == 401


class TestListRunsEndpoint:
    """Tests for GET /api/runs endpoint."""

    @pytest.mark.asyncio
    async def test_list_runs_empty(self, authenticated_client):
        """Should return empty list when no runs exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/runs")
        
        assert response.status_code == 200
        data = response.json()
        assert data["runs"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_runs_with_runs(self, authenticated_client, mock_executor):
        """Should return list of runs."""
        client, _ = authenticated_client
        
        # Create some runs
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "openai/gpt-4o"})
        await client.post("/api/runs", json={"benchmark": "gsm8k", "model": "openai/gpt-4"})
        
        response = await client.get("/api/runs")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["runs"]) == 2
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_list_runs_pagination(self, authenticated_client, mock_executor):
        """Should support pagination."""
        client, _ = authenticated_client
        
        # Create multiple runs
        for i in range(5):
            await client.post("/api/runs", json={"benchmark": f"test{i}", "model": "model"})
        
        response = await client.get("/api/runs?page=1&per_page=2")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["runs"]) == 2
        assert data["total"] == 5
        assert data["has_more"] is True

    @pytest.mark.asyncio
    async def test_list_runs_filter_by_status(self, authenticated_client, mock_executor):
        """Should filter runs by status."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "model"})
        
        response = await client.get("/api/runs?status=queued")
        
        assert response.status_code == 200
        data = response.json()
        # All new runs start as queued
        assert len(data["runs"]) >= 1

    @pytest.mark.asyncio
    async def test_list_runs_filter_by_benchmark(self, authenticated_client, mock_executor):
        """Should filter runs by benchmark."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "model"})
        await client.post("/api/runs", json={"benchmark": "gsm8k", "model": "model"})
        
        response = await client.get("/api/runs?benchmark=mmlu")
        
        assert response.status_code == 200
        data = response.json()
        assert all(r["benchmark"] == "mmlu" for r in data["runs"])

    @pytest.mark.asyncio
    async def test_list_runs_search(self, authenticated_client, mock_executor):
        """Should support search."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "openai/gpt-4o"})
        
        response = await client.get("/api/runs?search=mmlu")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["runs"]) >= 1


class TestGetRunEndpoint:
    """Tests for GET /api/runs/{run_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_run_exists(self, authenticated_client, mock_executor):
        """Should return run details when it exists."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.get(f"/api/runs/{run_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["run_id"] == run_id
        assert data["benchmark"] == "mmlu"
        assert data["model"] == "openai/gpt-4o"
        assert "status" in data
        assert "artifacts" in data

    @pytest.mark.asyncio
    async def test_get_run_not_found(self, authenticated_client):
        """Should return 404 when run doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/runs/nonexistent-run-id")
        
        assert response.status_code == 404


class TestCancelRunEndpoint:
    """Tests for POST /api/runs/{run_id}/cancel endpoint."""

    @pytest.mark.asyncio
    async def test_cancel_run_success(self, authenticated_client, mock_executor):
        """Should cancel a running run."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        # Mock the cancel to succeed
        mock_executor.cancel_run.return_value = True
        
        response = await client.post(f"/api/runs/{run_id}/cancel")
        
        assert response.status_code == 200
        assert response.json()["status"] == "canceled"

    @pytest.mark.asyncio
    async def test_cancel_run_not_running(self, authenticated_client, mock_executor):
        """Should return error when run is not running."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        # Mock the cancel to fail (not running)
        mock_executor.cancel_run.return_value = False
        
        response = await client.post(f"/api/runs/{run_id}/cancel")
        
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_run_not_found(self, authenticated_client):
        """Should return 404 when run doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs/nonexistent/cancel")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_cancel_run_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/runs/some-id/cancel")
        
        assert response.status_code == 401


class TestDeleteRunEndpoint:
    """Tests for DELETE /api/runs/{run_id} endpoint."""

    @pytest.mark.asyncio
    async def test_delete_run_success(self, authenticated_client, mock_executor):
        """Should delete a run."""
        client, _ = authenticated_client
        
        # Create a run (will be queued, not running)
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.delete(f"/api/runs/{run_id}")
        
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    @pytest.mark.asyncio
    async def test_delete_run_not_found(self, authenticated_client):
        """Should return 404 when run doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.delete("/api/runs/nonexistent")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_run_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.delete("/api/runs/some-id")
        
        assert response.status_code == 401


class TestBulkDeleteRunsEndpoint:
    """Tests for POST /api/runs/bulk-delete endpoint."""

    @pytest.mark.asyncio
    async def test_bulk_delete_success(self, authenticated_client, mock_executor):
        """Should delete multiple runs."""
        client, _ = authenticated_client
        
        # Create some runs
        run_ids = []
        for i in range(3):
            resp = await client.post("/api/runs", json={
                "benchmark": f"test{i}",
                "model": "model"
            })
            run_ids.append(resp.json()["run_id"])
        
        response = await client.post("/api/runs/bulk-delete", json=run_ids)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["summary"]["deleted"] == 3

    @pytest.mark.asyncio
    async def test_bulk_delete_partial(self, authenticated_client, mock_executor):
        """Should handle partial failures."""
        client, _ = authenticated_client
        
        # Create one run
        resp = await client.post("/api/runs", json={
            "benchmark": "test",
            "model": "model"
        })
        run_id = resp.json()["run_id"]
        
        # Try to delete existing and non-existing
        response = await client.post("/api/runs/bulk-delete", json=[
            run_id,
            "nonexistent-id"
        ])
        
        assert response.status_code == 200
        data = response.json()
        assert data["summary"]["deleted"] == 1
        assert data["summary"]["not_found"] == 1


class TestUpdateRunTagsEndpoint:
    """Tests for PATCH /api/runs/{run_id}/tags endpoint."""

    @pytest.mark.asyncio
    async def test_update_tags_success(self, authenticated_client, mock_executor):
        """Should update run tags."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.patch(f"/api/runs/{run_id}/tags", json={
            "tags": ["baseline", "production"]
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "baseline" in data["tags"]
        assert "production" in data["tags"]

    @pytest.mark.asyncio
    async def test_update_tags_empty(self, authenticated_client, mock_executor):
        """Should allow setting empty tags."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        # Set some tags first
        await client.patch(f"/api/runs/{run_id}/tags", json={"tags": ["test"]})
        
        # Clear tags
        response = await client.patch(f"/api/runs/{run_id}/tags", json={"tags": []})
        
        assert response.status_code == 200
        assert response.json()["tags"] == []

    @pytest.mark.asyncio
    async def test_update_tags_not_found(self, authenticated_client):
        """Should return 404 when run doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.patch("/api/runs/nonexistent/tags", json={
            "tags": ["test"]
        })
        
        assert response.status_code == 404


class TestListAllTagsEndpoint:
    """Tests for GET /api/runs/tags endpoint."""

    @pytest.mark.asyncio
    async def test_list_tags_empty(self, authenticated_client):
        """Should return empty list when no tags exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/runs/tags")
        
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_tags_with_tags(self, authenticated_client, mock_executor):
        """Should return unique tags."""
        client, _ = authenticated_client
        
        # Create runs with tags
        for i in range(2):
            resp = await client.post("/api/runs", json={
                "benchmark": f"test{i}",
                "model": "model"
            })
            run_id = resp.json()["run_id"]
            await client.patch(f"/api/runs/{run_id}/tags", json={
                "tags": ["common", f"unique{i}"]
            })
        
        response = await client.get("/api/runs/tags")
        
        assert response.status_code == 200
        tags = response.json()
        assert "common" in tags


class TestUpdateRunNotesEndpoint:
    """Tests for PATCH /api/runs/{run_id}/notes endpoint."""

    @pytest.mark.asyncio
    async def test_update_notes_success(self, authenticated_client, mock_executor):
        """Should update run notes."""
        client, _ = authenticated_client
        
        # Create a run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.patch(f"/api/runs/{run_id}/notes", json={
            "notes": "This is a test run."
        })
        
        assert response.status_code == 200
        assert response.json()["notes"] == "This is a test run."

    @pytest.mark.asyncio
    async def test_update_notes_clear(self, authenticated_client, mock_executor):
        """Should allow clearing notes."""
        client, _ = authenticated_client
        
        # Create a run and set notes
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        run_id = create_response.json()["run_id"]
        await client.patch(f"/api/runs/{run_id}/notes", json={"notes": "Initial note"})
        
        # Clear notes
        response = await client.patch(f"/api/runs/{run_id}/notes", json={"notes": None})
        
        assert response.status_code == 200


class TestDuplicateRunEndpoint:
    """Tests for POST /api/runs/{run_id}/duplicate endpoint."""

    @pytest.mark.asyncio
    async def test_duplicate_run_success(self, authenticated_client, mock_executor):
        """Should duplicate a run."""
        client, _ = authenticated_client
        
        # Create original run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "limit": 50
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.post(f"/api/runs/{run_id}/duplicate")
        
        assert response.status_code == 200
        assert "run_id" in response.json()
        assert response.json()["run_id"] != run_id

    @pytest.mark.asyncio
    async def test_duplicate_run_with_overrides(self, authenticated_client, mock_executor):
        """Should allow overriding parameters."""
        client, _ = authenticated_client
        
        # Create original run
        create_response = await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        run_id = create_response.json()["run_id"]
        
        response = await client.post(f"/api/runs/{run_id}/duplicate", json={
            "model": "anthropic/claude-3-opus",
            "limit": 100
        })
        
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_duplicate_run_not_found(self, authenticated_client):
        """Should return 404 when run doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.post("/api/runs/nonexistent/duplicate")
        
        assert response.status_code == 404


class TestScheduledRunsEndpoints:
    """Tests for scheduled runs endpoints."""

    @pytest.mark.asyncio
    async def test_schedule_run(self, authenticated_client, mock_executor):
        """Should schedule a run for future execution."""
        client, _ = authenticated_client
        
        from datetime import datetime, timedelta
        future_time = (datetime.utcnow() + timedelta(hours=1)).isoformat() + "Z"
        
        response = await client.post("/api/runs/schedule", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "scheduled_for": future_time
        })
        
        assert response.status_code == 200
        assert "run_id" in response.json()

    @pytest.mark.asyncio
    async def test_schedule_run_past_time(self, authenticated_client):
        """Should reject scheduling in the past."""
        client, _ = authenticated_client
        
        from datetime import datetime, timedelta
        past_time = (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z"
        
        response = await client.post("/api/runs/schedule", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "scheduled_for": past_time
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_scheduled_runs(self, authenticated_client, mock_executor):
        """Should list scheduled runs."""
        client, _ = authenticated_client
        
        from datetime import datetime, timedelta
        future_time = (datetime.utcnow() + timedelta(hours=1)).isoformat() + "Z"
        
        # Schedule a run
        await client.post("/api/runs/schedule", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "scheduled_for": future_time
        })
        
        response = await client.get("/api/runs/scheduled")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
