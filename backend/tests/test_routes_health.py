"""
Tests for health and version API routes.

Tests cover:
- Health check endpoint
- Version information endpoint
"""

import pytest
from unittest.mock import patch


class TestHealthEndpoint:
    """Tests for /api/health endpoint."""

    @pytest.mark.asyncio
    async def test_health_check_returns_ok(self, client):
        """Health check should return status ok/healthy."""
        response = await client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        # Accept either "ok" or "healthy" as valid status
        assert data["status"] in ["ok", "healthy"]

    @pytest.mark.asyncio
    async def test_health_check_no_auth_required(self, client):
        """Health check should not require authentication."""
        # Ensure no auth header is present
        client.headers.pop("Authorization", None)
        
        response = await client.get("/api/health")
        
        assert response.status_code == 200


class TestVersionEndpoint:
    """Tests for /api/version endpoint."""

    @pytest.mark.asyncio
    async def test_version_returns_web_ui_version(self, client):
        """Version should include web UI version."""
        response = await client.get("/api/version")
        
        assert response.status_code == 200
        data = response.json()
        assert "web_ui" in data
        # Accept any valid version string
        assert isinstance(data["web_ui"], str)
        assert len(data["web_ui"]) > 0

    @pytest.mark.asyncio
    async def test_version_includes_openbench_info(self, client):
        """Version should include OpenBench availability info."""
        response = await client.get("/api/version")
        
        assert response.status_code == 200
        data = response.json()
        assert "openbench_available" in data
        assert isinstance(data["openbench_available"], bool)

    @pytest.mark.asyncio
    async def test_version_with_openbench_installed(self, client):
        """When OpenBench is installed, version should be returned."""
        with patch('app.api.routes.health.get_openbench_version', return_value="0.5.3"):
            response = await client.get("/api/version")
            
            assert response.status_code == 200
            data = response.json()
            assert data["openbench"] == "0.5.3"
            assert data["openbench_available"] is True

    @pytest.mark.asyncio
    async def test_version_without_openbench(self, client):
        """When OpenBench is not installed, should indicate unavailable."""
        with patch('app.api.routes.health.get_openbench_version', return_value=None):
            response = await client.get("/api/version")
            
            assert response.status_code == 200
            data = response.json()
            assert data["openbench"] is None
            assert data["openbench_available"] is False

    @pytest.mark.asyncio
    async def test_version_no_auth_required(self, client):
        """Version check should not require authentication."""
        client.headers.pop("Authorization", None)
        
        response = await client.get("/api/version")
        
        assert response.status_code == 200
