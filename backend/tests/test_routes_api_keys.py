"""
Tests for API Keys management routes.

Tests cover:
- List API keys
- Create/update API keys
- Delete API keys
- List supported providers
- Get available models
- Get compatible models
"""

import pytest
from unittest.mock import patch, AsyncMock


class TestListApiKeysEndpoint:
    """Tests for GET /api/api-keys endpoint."""

    @pytest.mark.asyncio
    async def test_list_keys_empty(self, authenticated_client):
        """Should return empty list when no keys configured."""
        client, _ = authenticated_client
        
        response = await client.get("/api/api-keys")
        
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_keys_with_keys(self, authenticated_client):
        """Should return list of configured keys."""
        client, _ = authenticated_client
        
        # Create some keys first
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-test1234567890"
        })
        await client.post("/api/api-keys", json={
            "provider": "anthropic",
            "key": "sk-ant-test1234567890"
        })
        
        response = await client.get("/api/api-keys")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        providers = {k["provider"] for k in data}
        assert "openai" in providers
        assert "anthropic" in providers

    @pytest.mark.asyncio
    async def test_list_keys_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/api-keys")
        
        assert response.status_code == 401


class TestCreateApiKeyEndpoint:
    """Tests for POST /api/api-keys endpoint."""

    @pytest.mark.asyncio
    async def test_create_key_success(self, authenticated_client):
        """Should create a new API key."""
        client, _ = authenticated_client
        
        response = await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-testkeyvalue1234567890"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "openai"
        assert "key_preview" in data
        assert data["key_preview"].endswith("7890")

    @pytest.mark.asyncio
    async def test_create_key_update_existing(self, authenticated_client):
        """Should update existing key for same provider."""
        client, _ = authenticated_client
        
        # Create initial key
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-oldkey1234"
        })
        
        # Update with new key
        response = await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-newkey5678"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["key_preview"] == "...5678"

    @pytest.mark.asyncio
    async def test_create_key_with_custom_env_var(self, authenticated_client):
        """Should store custom environment variable name."""
        client, _ = authenticated_client
        
        response = await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-customenvkey",
            "custom_env_var": "MY_CUSTOM_OPENAI_KEY"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["custom_env_var"] == "MY_CUSTOM_OPENAI_KEY"

    @pytest.mark.asyncio
    async def test_create_key_missing_provider(self, authenticated_client):
        """Should reject request without provider."""
        client, _ = authenticated_client
        
        response = await client.post("/api/api-keys", json={
            "key": "sk-testkey"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_key_missing_key(self, authenticated_client):
        """Should reject request without key."""
        client, _ = authenticated_client
        
        response = await client.post("/api/api-keys", json={
            "provider": "openai"
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_key_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-testkey"
        })
        
        assert response.status_code == 401


class TestDeleteApiKeyEndpoint:
    """Tests for DELETE /api/api-keys/{provider} endpoint."""

    @pytest.mark.asyncio
    async def test_delete_key_success(self, authenticated_client):
        """Should delete an existing key."""
        client, _ = authenticated_client
        
        # Create key first
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-todelete1234"
        })
        
        # Delete it
        response = await client.delete("/api/api-keys/openai")
        
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        
        # Verify it's gone
        list_response = await client.get("/api/api-keys")
        assert len(list_response.json()) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_key(self, authenticated_client):
        """Should return 404 for non-existent key."""
        client, _ = authenticated_client
        
        response = await client.delete("/api/api-keys/nonexistent")
        
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_key_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.delete("/api/api-keys/openai")
        
        assert response.status_code == 401


class TestListProvidersEndpoint:
    """Tests for GET /api/api-keys/providers endpoint."""

    @pytest.mark.asyncio
    async def test_list_providers(self, client, test_db):
        """Should return list of supported providers."""
        response = await client.get("/api/api-keys/providers")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Check structure
        first_provider = data[0]
        assert "provider" in first_provider
        assert "env_var" in first_provider
        assert "display_name" in first_provider

    @pytest.mark.asyncio
    async def test_list_providers_includes_common_providers(self, client, test_db):
        """Should include common providers like OpenAI, Anthropic."""
        response = await client.get("/api/api-keys/providers")
        
        data = response.json()
        providers = {p["provider"] for p in data}
        
        assert "openai" in providers
        assert "anthropic" in providers
        assert "google" in providers

    @pytest.mark.asyncio
    async def test_list_providers_no_auth_required(self, client, test_db):
        """Should not require authentication."""
        client.headers.pop("Authorization", None)
        
        response = await client.get("/api/api-keys/providers")
        
        assert response.status_code == 200


class TestAvailableModelsEndpoint:
    """Tests for GET /api/available-models endpoint."""

    @pytest.mark.asyncio
    async def test_available_models_authenticated(self, authenticated_client, mock_model_discovery):
        """Should return available models for authenticated user."""
        client, _ = authenticated_client
        
        response = await client.get("/api/available-models")
        
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert len(data["providers"]) > 0

    @pytest.mark.asyncio
    async def test_available_models_force_refresh(self, authenticated_client, mock_model_discovery):
        """Should accept force_refresh parameter."""
        client, _ = authenticated_client
        
        response = await client.get("/api/available-models?force_refresh=true")
        
        assert response.status_code == 200
        mock_model_discovery.get_available_models.assert_called_with(
            pytest.approx(pytest.ANY),  # user_id
            force_refresh=True
        )

    @pytest.mark.asyncio
    async def test_available_models_include_capabilities(self, authenticated_client, mock_model_discovery):
        """Should include capabilities when requested."""
        client, _ = authenticated_client
        
        response = await client.get("/api/available-models?include_capabilities=true")
        
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_available_models_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/available-models")
        
        assert response.status_code == 401


class TestCompatibleModelsEndpoint:
    """Tests for GET /api/compatible-models endpoint."""

    @pytest.mark.asyncio
    async def test_compatible_models_with_benchmark(self, authenticated_client, mock_model_discovery):
        """Should return compatible models for a benchmark."""
        client, _ = authenticated_client
        
        response = await client.get("/api/compatible-models?benchmark=mmlu")
        
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert "incompatible" in data
        assert "requirements" in data

    @pytest.mark.asyncio
    async def test_compatible_models_missing_benchmark(self, authenticated_client):
        """Should reject request without benchmark parameter."""
        client, _ = authenticated_client
        
        response = await client.get("/api/compatible-models")
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_compatible_models_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/compatible-models?benchmark=mmlu")
        
        assert response.status_code == 401
