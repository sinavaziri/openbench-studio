"""
Tests for run template management API routes.

Tests cover:
- Create template
- List templates
- Get template details
- Update template
- Delete template
- Create run from template
"""

import pytest
from unittest.mock import patch, AsyncMock


class TestCreateTemplateEndpoint:
    """Tests for POST /api/templates endpoint."""

    @pytest.mark.asyncio
    async def test_create_template_success(self, authenticated_client):
        """Should create a new template."""
        client, _ = authenticated_client
        
        response = await client.post("/api/templates", json={
            "name": "My Test Template",
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "config": {
                "limit": 100,
                "temperature": 0.5
            }
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "My Test Template"
        assert data["benchmark"] == "mmlu"
        assert data["model"] == "openai/gpt-4o"
        assert "template_id" in data

    @pytest.mark.asyncio
    async def test_create_template_minimal(self, authenticated_client):
        """Should create template with minimal required fields."""
        client, _ = authenticated_client
        
        response = await client.post("/api/templates", json={
            "name": "Minimal Template",
            "benchmark": "gsm8k",
            "model": "anthropic/claude-3-opus"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Minimal Template"

    @pytest.mark.asyncio
    async def test_create_template_missing_name(self, authenticated_client):
        """Should reject template without name."""
        client, _ = authenticated_client
        
        response = await client.post("/api/templates", json={
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_template_missing_benchmark(self, authenticated_client):
        """Should reject template without benchmark."""
        client, _ = authenticated_client
        
        response = await client.post("/api/templates", json={
            "name": "Test",
            "model": "openai/gpt-4o"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_template_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/templates", json={
            "name": "Test",
            "benchmark": "mmlu",
            "model": "model"
        })
        
        assert response.status_code == 401


class TestListTemplatesEndpoint:
    """Tests for GET /api/templates endpoint."""

    @pytest.mark.asyncio
    async def test_list_templates_empty(self, authenticated_client):
        """Should return empty list when no templates exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/templates")
        
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_templates_with_templates(self, authenticated_client):
        """Should return list of templates."""
        client, _ = authenticated_client
        
        # Create templates
        await client.post("/api/templates", json={
            "name": "Template 1",
            "benchmark": "mmlu",
            "model": "openai/gpt-4o"
        })
        await client.post("/api/templates", json={
            "name": "Template 2",
            "benchmark": "gsm8k",
            "model": "anthropic/claude-3-opus"
        })
        
        response = await client.get("/api/templates")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_list_templates_limit(self, authenticated_client):
        """Should respect limit parameter."""
        client, _ = authenticated_client
        
        # Create multiple templates
        for i in range(5):
            await client.post("/api/templates", json={
                "name": f"Template {i}",
                "benchmark": "mmlu",
                "model": "model"
            })
        
        response = await client.get("/api/templates?limit=3")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_list_templates_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/templates")
        
        assert response.status_code == 401


class TestGetTemplateEndpoint:
    """Tests for GET /api/templates/{template_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_template_exists(self, authenticated_client):
        """Should return template details when it exists."""
        client, _ = authenticated_client
        
        # Create a template
        create_response = await client.post("/api/templates", json={
            "name": "Test Template",
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "config": {"limit": 50}
        })
        template_id = create_response.json()["template_id"]
        
        response = await client.get(f"/api/templates/{template_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["template_id"] == template_id
        assert data["name"] == "Test Template"
        assert data["benchmark"] == "mmlu"
        assert data["config"]["limit"] == 50

    @pytest.mark.asyncio
    async def test_get_template_not_found(self, authenticated_client):
        """Should return 404 when template doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/templates/nonexistent-id")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_template_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/templates/some-id")
        
        assert response.status_code == 401


class TestUpdateTemplateEndpoint:
    """Tests for PATCH /api/templates/{template_id} endpoint."""

    @pytest.mark.asyncio
    async def test_update_template_name(self, authenticated_client):
        """Should update template name."""
        client, _ = authenticated_client
        
        # Create a template
        create_response = await client.post("/api/templates", json={
            "name": "Original Name",
            "benchmark": "mmlu",
            "model": "model"
        })
        template_id = create_response.json()["template_id"]
        
        response = await client.patch(f"/api/templates/{template_id}", json={
            "name": "Updated Name"
        })
        
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_template_not_found(self, authenticated_client):
        """Should return 404 when template doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.patch("/api/templates/nonexistent", json={
            "name": "New Name"
        })
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_template_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.patch("/api/templates/some-id", json={
            "name": "New Name"
        })
        
        assert response.status_code == 401


class TestDeleteTemplateEndpoint:
    """Tests for DELETE /api/templates/{template_id} endpoint."""

    @pytest.mark.asyncio
    async def test_delete_template_success(self, authenticated_client):
        """Should delete template."""
        client, _ = authenticated_client
        
        # Create a template
        create_response = await client.post("/api/templates", json={
            "name": "To Delete",
            "benchmark": "mmlu",
            "model": "model"
        })
        template_id = create_response.json()["template_id"]
        
        response = await client.delete(f"/api/templates/{template_id}")
        
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        
        # Verify it's gone
        get_response = await client.get(f"/api/templates/{template_id}")
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_template_not_found(self, authenticated_client):
        """Should return 404 when template doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.delete("/api/templates/nonexistent")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_template_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.delete("/api/templates/some-id")
        
        assert response.status_code == 401


class TestRunFromTemplateEndpoint:
    """Tests for POST /api/templates/{template_id}/run endpoint."""

    @pytest.mark.asyncio
    async def test_run_from_template_success(self, authenticated_client, mock_executor):
        """Should create run from template."""
        client, _ = authenticated_client
        
        # Create a template
        create_response = await client.post("/api/templates", json={
            "name": "Run Template",
            "benchmark": "mmlu",
            "model": "openai/gpt-4o",
            "config": {"limit": 100}
        })
        template_id = create_response.json()["template_id"]
        
        response = await client.post(f"/api/templates/{template_id}/run")
        
        assert response.status_code == 200
        assert "run_id" in response.json()

    @pytest.mark.asyncio
    async def test_run_from_template_not_found(self, authenticated_client):
        """Should return 404 when template doesn't exist."""
        client, _ = authenticated_client
        
        response = await client.post("/api/templates/nonexistent/run")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_run_from_template_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/templates/some-id/run")
        
        assert response.status_code == 401
