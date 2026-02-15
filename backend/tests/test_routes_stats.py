"""
Tests for statistics API routes.

Tests cover:
- Summary statistics
- Run history
- Model statistics
- Benchmark statistics
"""

import pytest
from unittest.mock import patch, AsyncMock


class TestSummaryStatsEndpoint:
    """Tests for GET /api/stats/summary endpoint."""

    @pytest.mark.asyncio
    async def test_summary_empty(self, authenticated_client):
        """Should return zero counts when no runs exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/summary")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_runs"] == 0
        assert data["completed_runs"] == 0
        assert data["failed_runs"] == 0
        assert data["running_runs"] == 0
        assert data["success_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_summary_with_runs(self, authenticated_client, mock_executor):
        """Should return correct counts with runs."""
        client, _ = authenticated_client
        
        # Create some runs
        for i in range(3):
            await client.post("/api/runs", json={
                "benchmark": f"test{i}",
                "model": "model"
            })
        
        response = await client.get("/api/stats/summary")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_runs"] == 3
        assert data["unique_benchmarks"] == 3

    @pytest.mark.asyncio
    async def test_summary_with_days_filter(self, authenticated_client):
        """Should accept days parameter."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/summary?days=7")
        
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_summary_invalid_days(self, authenticated_client):
        """Should reject invalid days value."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/summary?days=0")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_summary_no_auth_allowed(self, client, test_db):
        """Should allow unauthenticated access."""
        response = await client.get("/api/stats/summary")
        
        assert response.status_code == 200


class TestHistoryEndpoint:
    """Tests for GET /api/stats/history endpoint."""

    @pytest.mark.asyncio
    async def test_history_empty(self, authenticated_client):
        """Should return empty data when no runs exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/history")
        
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "period" in data
        assert data["period"] == "day"

    @pytest.mark.asyncio
    async def test_history_with_runs(self, authenticated_client, mock_executor):
        """Should return history data with runs."""
        client, _ = authenticated_client
        
        # Create some runs
        for i in range(3):
            await client.post("/api/runs", json={
                "benchmark": "mmlu",
                "model": "model"
            })
        
        response = await client.get("/api/stats/history")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) > 0

    @pytest.mark.asyncio
    async def test_history_daily_period(self, authenticated_client):
        """Should aggregate by day when period=day."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/history?period=day")
        
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "day"

    @pytest.mark.asyncio
    async def test_history_weekly_period(self, authenticated_client):
        """Should aggregate by week when period=week."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/history?period=week")
        
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "week"

    @pytest.mark.asyncio
    async def test_history_invalid_period(self, authenticated_client):
        """Should reject invalid period value."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/history?period=month")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_history_with_days_filter(self, authenticated_client):
        """Should filter by number of days."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/history?days=7")
        
        assert response.status_code == 200
        data = response.json()
        # For 7 days, expect around 7-8 data points with daily period
        assert len(data["data"]) <= 8

    @pytest.mark.asyncio
    async def test_history_data_point_structure(self, authenticated_client, mock_executor):
        """Should have correct data point structure."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        
        response = await client.get("/api/stats/history?days=1")
        
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            point = data["data"][0]
            assert "date" in point
            assert "total" in point
            assert "completed" in point
            assert "failed" in point


class TestModelStatsEndpoint:
    """Tests for GET /api/stats/models endpoint."""

    @pytest.mark.asyncio
    async def test_model_stats_empty(self, authenticated_client):
        """Should return empty list when no runs exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/models")
        
        assert response.status_code == 200
        data = response.json()
        assert data["models"] == []
        assert data["total_runs"] == 0

    @pytest.mark.asyncio
    async def test_model_stats_with_runs(self, authenticated_client, mock_executor):
        """Should return model statistics with runs."""
        client, _ = authenticated_client
        
        # Create runs with different models
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "openai/gpt-4o"})
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "openai/gpt-4o"})
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "anthropic/claude-3"})
        
        response = await client.get("/api/stats/models")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["models"]) >= 2
        assert data["total_runs"] == 3

    @pytest.mark.asyncio
    async def test_model_stats_limit(self, authenticated_client, mock_executor):
        """Should respect limit parameter."""
        client, _ = authenticated_client
        
        # Create runs with different models
        for i in range(5):
            await client.post("/api/runs", json={
                "benchmark": "mmlu",
                "model": f"model{i}"
            })
        
        response = await client.get("/api/stats/models?limit=3")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["models"]) <= 3

    @pytest.mark.asyncio
    async def test_model_stats_structure(self, authenticated_client, mock_executor):
        """Should have correct model stats structure."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        
        response = await client.get("/api/stats/models")
        
        assert response.status_code == 200
        data = response.json()
        if data["models"]:
            model = data["models"][0]
            assert "model" in model
            assert "run_count" in model
            assert "completed_count" in model
            assert "failed_count" in model
            assert "success_rate" in model


class TestBenchmarkStatsEndpoint:
    """Tests for GET /api/stats/benchmarks endpoint."""

    @pytest.mark.asyncio
    async def test_benchmark_stats_empty(self, authenticated_client):
        """Should return empty list when no runs exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/benchmarks")
        
        assert response.status_code == 200
        data = response.json()
        assert data["benchmarks"] == []
        assert data["total_runs"] == 0

    @pytest.mark.asyncio
    async def test_benchmark_stats_with_runs(self, authenticated_client, mock_executor):
        """Should return benchmark statistics with runs."""
        client, _ = authenticated_client
        
        # Create runs with different benchmarks
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "model"})
        await client.post("/api/runs", json={"benchmark": "mmlu", "model": "model"})
        await client.post("/api/runs", json={"benchmark": "gsm8k", "model": "model"})
        
        response = await client.get("/api/stats/benchmarks")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["benchmarks"]) >= 2
        assert data["total_runs"] == 3

    @pytest.mark.asyncio
    async def test_benchmark_stats_limit(self, authenticated_client, mock_executor):
        """Should respect limit parameter."""
        client, _ = authenticated_client
        
        for i in range(5):
            await client.post("/api/runs", json={
                "benchmark": f"bench{i}",
                "model": "model"
            })
        
        response = await client.get("/api/stats/benchmarks?limit=3")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["benchmarks"]) <= 3

    @pytest.mark.asyncio
    async def test_benchmark_stats_structure(self, authenticated_client, mock_executor):
        """Should have correct benchmark stats structure."""
        client, _ = authenticated_client
        
        await client.post("/api/runs", json={
            "benchmark": "mmlu",
            "model": "model"
        })
        
        response = await client.get("/api/stats/benchmarks")
        
        assert response.status_code == 200
        data = response.json()
        if data["benchmarks"]:
            bench = data["benchmarks"][0]
            assert "benchmark" in bench
            assert "run_count" in bench
            assert "completed_count" in bench
            assert "failed_count" in bench

    @pytest.mark.asyncio
    async def test_benchmark_stats_days_filter(self, authenticated_client):
        """Should filter by number of days."""
        client, _ = authenticated_client
        
        response = await client.get("/api/stats/benchmarks?days=7")
        
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_stats_no_auth_allowed(self, client, test_db):
        """Stats endpoints should allow unauthenticated access."""
        # Test all stats endpoints
        endpoints = [
            "/api/stats/summary",
            "/api/stats/history",
            "/api/stats/models",
            "/api/stats/benchmarks",
        ]
        
        for endpoint in endpoints:
            response = await client.get(endpoint)
            assert response.status_code == 200, f"Failed for {endpoint}"
