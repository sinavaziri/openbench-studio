"""
Tests for benchmark catalog API routes.

Tests cover:
- List benchmarks
- Get benchmark details
"""

import pytest
from unittest.mock import patch, AsyncMock


class TestListBenchmarksEndpoint:
    """Tests for GET /api/benchmarks endpoint."""

    @pytest.mark.asyncio
    async def test_list_benchmarks(self, client, test_db, mock_benchmark_catalog):
        """Should return list of benchmarks."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmarks = [
            Benchmark(
                name=b["name"],
                category=b["category"],
                description_short=b["description_short"],
                description=b["description"],
                tags=b["tags"],
                featured=b["featured"],
                source=b["source"],
                requirements=BenchmarkRequirements(),
            )
            for b in mock_benchmark_catalog
        ]
        
        with patch('app.services.benchmark_catalog.get_benchmarks', 
                   new=AsyncMock(return_value=mock_benchmarks)):
            response = await client.get("/api/benchmarks")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) >= 3

    @pytest.mark.asyncio
    async def test_list_benchmarks_includes_requirements(self, client, test_db, mock_benchmark_catalog):
        """Should include capability requirements for each benchmark."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmarks = [
            Benchmark(
                name="mmlu",
                category="Knowledge",
                description_short="MMLU",
                tags=["knowledge"],
                featured=True,
                source="builtin",
                requirements=BenchmarkRequirements(
                    vision=False,
                    code_execution=False,
                    function_calling=False,
                ),
            )
        ]
        
        with patch('app.services.benchmark_catalog.get_benchmarks',
                   new=AsyncMock(return_value=mock_benchmarks)):
            response = await client.get("/api/benchmarks")
            
            assert response.status_code == 200
            data = response.json()
            assert len(data) > 0
            assert "requirements" in data[0]
            reqs = data[0]["requirements"]
            assert "vision" in reqs
            assert "code_execution" in reqs
            assert "function_calling" in reqs

    @pytest.mark.asyncio
    async def test_list_benchmarks_no_auth_required(self, client, test_db, mock_benchmark_catalog):
        """Should not require authentication."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmarks = [
            Benchmark(
                name="test",
                category="Test",
                description_short="Test benchmark",
                tags=[],
                featured=False,
                source="test",
                requirements=BenchmarkRequirements(),
            )
        ]
        
        client.headers.pop("Authorization", None)
        
        with patch('app.services.benchmark_catalog.get_benchmarks',
                   new=AsyncMock(return_value=mock_benchmarks)):
            response = await client.get("/api/benchmarks")
            
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_list_benchmarks_has_cache_headers(self, client, test_db, mock_benchmark_catalog):
        """Should have cache control headers."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmarks = [
            Benchmark(
                name="test",
                category="Test",
                description_short="Test",
                tags=[],
                featured=False,
                source="test",
                requirements=BenchmarkRequirements(),
            )
        ]
        
        with patch('app.services.benchmark_catalog.get_benchmarks',
                   new=AsyncMock(return_value=mock_benchmarks)):
            response = await client.get("/api/benchmarks")
            
            assert response.status_code == 200
            assert "cache-control" in response.headers


class TestGetBenchmarkEndpoint:
    """Tests for GET /api/benchmarks/{name} endpoint."""

    @pytest.mark.asyncio
    async def test_get_benchmark_exists(self, client, test_db):
        """Should return benchmark details when it exists."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmark = Benchmark(
            name="mmlu",
            category="Knowledge",
            description_short="Massive Multitask Language Understanding",
            description="Full description",
            tags=["knowledge", "multiple-choice"],
            featured=True,
            source="builtin",
            requirements=BenchmarkRequirements(),
            estimated_tokens=2000,
            sample_count=14042,
        )
        
        with patch('app.services.benchmark_catalog.get_benchmark',
                   new=AsyncMock(return_value=mock_benchmark)):
            response = await client.get("/api/benchmarks/mmlu")
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "mmlu"
            assert data["category"] == "Knowledge"
            assert "requirements" in data

    @pytest.mark.asyncio
    async def test_get_benchmark_not_found(self, client, test_db):
        """Should return 404 when benchmark doesn't exist."""
        with patch('app.services.benchmark_catalog.get_benchmark',
                   new=AsyncMock(return_value=None)):
            response = await client.get("/api/benchmarks/nonexistent")
            
            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_get_benchmark_no_auth_required(self, client, test_db):
        """Should not require authentication."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmark = Benchmark(
            name="test",
            category="Test",
            description_short="Test",
            tags=[],
            featured=False,
            source="test",
            requirements=BenchmarkRequirements(),
        )
        
        client.headers.pop("Authorization", None)
        
        with patch('app.services.benchmark_catalog.get_benchmark',
                   new=AsyncMock(return_value=mock_benchmark)):
            response = await client.get("/api/benchmarks/test")
            
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_benchmark_includes_metadata(self, client, test_db):
        """Should include all metadata fields."""
        from app.db.models import Benchmark, BenchmarkRequirements
        
        mock_benchmark = Benchmark(
            name="gsm8k",
            category="Math",
            description_short="Grade School Math",
            description="Math word problems requiring multi-step reasoning",
            tags=["math", "reasoning", "word-problems"],
            featured=True,
            source="builtin",
            requirements=BenchmarkRequirements(min_context_length=4096),
            estimated_tokens=500,
            sample_count=8792,
        )
        
        with patch('app.services.benchmark_catalog.get_benchmark',
                   new=AsyncMock(return_value=mock_benchmark)):
            response = await client.get("/api/benchmarks/gsm8k")
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "gsm8k"
            assert data["category"] == "Math"
            assert "math" in data["tags"]
            assert data["featured"] is True
            assert data["sample_count"] == 8792
