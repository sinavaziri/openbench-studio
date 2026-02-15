"""
Tests for settings import/export API routes.

Tests cover:
- Export settings
- Import settings preview
- Import settings
- Password encryption for exports
"""

import pytest
import base64
from unittest.mock import patch, AsyncMock


class TestExportSettingsEndpoint:
    """Tests for GET /api/settings/export endpoint."""

    @pytest.mark.asyncio
    async def test_export_empty_settings(self, authenticated_client):
        """Should export empty settings when no keys exist."""
        client, _ = authenticated_client
        
        response = await client.get("/api/settings/export")
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["schema_version"] == 1
        assert data["api_keys"] == []
        assert data["encrypted"] is False

    @pytest.mark.asyncio
    async def test_export_with_api_keys(self, authenticated_client):
        """Should export API keys."""
        client, _ = authenticated_client
        
        # Create an API key
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-testexportkey123"
        })
        
        response = await client.get("/api/settings/export")
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data["api_keys"]) == 1
        assert data["api_keys"][0]["provider"] == "openai"
        assert "encrypted_value" in data["api_keys"][0]

    @pytest.mark.asyncio
    async def test_export_with_password(self, authenticated_client):
        """Should encrypt export with password."""
        client, _ = authenticated_client
        
        # Create an API key
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-encryptme123"
        })
        
        response = await client.get("/api/settings/export?password=mypassword")
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["encrypted"] is True
        assert data["salt"] is not None

    @pytest.mark.asyncio
    async def test_export_includes_custom_env_var(self, authenticated_client):
        """Should include custom environment variable in export."""
        client, _ = authenticated_client
        
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-custom123",
            "custom_env_var": "MY_CUSTOM_KEY"
        })
        
        response = await client.get("/api/settings/export")
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["api_keys"][0]["custom_env_var"] == "MY_CUSTOM_KEY"

    @pytest.mark.asyncio
    async def test_export_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/settings/export")
        
        assert response.status_code == 401


class TestImportPreviewEndpoint:
    """Tests for POST /api/settings/import/preview endpoint."""

    @pytest.mark.asyncio
    async def test_preview_valid_export(self, authenticated_client):
        """Should preview valid import data."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": False,
            "api_keys": [{
                "provider": "openai",
                "encrypted_value": base64.b64encode(b"sk-testimport123").decode()
            }]
        }
        
        response = await client.post("/api/settings/import/preview", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["api_keys"]) == 1
        assert data["api_keys"][0]["provider"] == "openai"
        assert "openai" in data["new_providers"]
        assert data["errors"] == []

    @pytest.mark.asyncio
    async def test_preview_encrypted_without_password(self, authenticated_client):
        """Should return error for encrypted data without password."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": True,
            "salt": base64.b64encode(b"randomsalt123456").decode(),
            "api_keys": [{
                "provider": "openai",
                "encrypted_value": "encrypted_data_here"
            }]
        }
        
        response = await client.post("/api/settings/import/preview", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["errors"]) > 0
        assert "password" in data["errors"][0].lower()

    @pytest.mark.asyncio
    async def test_preview_invalid_schema_version(self, authenticated_client):
        """Should reject unsupported schema version."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 99,
            "exported_at": "2024-01-01T00:00:00Z",
            "api_keys": []
        }
        
        response = await client.post("/api/settings/import/preview", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["errors"]) > 0
        assert "schema" in data["errors"][0].lower()

    @pytest.mark.asyncio
    async def test_preview_shows_overwrites(self, authenticated_client):
        """Should identify providers that will be overwritten."""
        client, _ = authenticated_client
        
        # Create existing key
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-existing"
        })
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": False,
            "api_keys": [{
                "provider": "openai",
                "encrypted_value": base64.b64encode(b"sk-newkey").decode()
            }]
        }
        
        response = await client.post("/api/settings/import/preview", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "openai" in data["will_overwrite"]

    @pytest.mark.asyncio
    async def test_preview_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/settings/import/preview", json={
            "data": {"schema_version": 1}
        })
        
        assert response.status_code == 401


class TestImportSettingsEndpoint:
    """Tests for POST /api/settings/import endpoint."""

    @pytest.mark.asyncio
    async def test_import_success(self, authenticated_client):
        """Should import settings successfully."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": False,
            "api_keys": [{
                "provider": "anthropic",
                "encrypted_value": base64.b64encode(b"sk-ant-import123").decode()
            }]
        }
        
        response = await client.post("/api/settings/import", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["imported_count"] == 1
        
        # Verify the key was imported
        keys_response = await client.get("/api/api-keys")
        assert any(k["provider"] == "anthropic" for k in keys_response.json())

    @pytest.mark.asyncio
    async def test_import_multiple_keys(self, authenticated_client):
        """Should import multiple API keys."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": False,
            "api_keys": [
                {
                    "provider": "openai",
                    "encrypted_value": base64.b64encode(b"sk-open").decode()
                },
                {
                    "provider": "anthropic",
                    "encrypted_value": base64.b64encode(b"sk-ant").decode()
                },
                {
                    "provider": "google",
                    "encrypted_value": base64.b64encode(b"key-google").decode()
                }
            ]
        }
        
        response = await client.post("/api/settings/import", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["imported_count"] == 3

    @pytest.mark.asyncio
    async def test_import_overwrites_existing(self, authenticated_client):
        """Should overwrite existing keys."""
        client, _ = authenticated_client
        
        # Create existing key
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-oldkey"
        })
        
        import_data = {
            "schema_version": 1,
            "exported_at": "2024-01-01T00:00:00Z",
            "encrypted": False,
            "api_keys": [{
                "provider": "openai",
                "encrypted_value": base64.b64encode(b"sk-newkey").decode()
            }]
        }
        
        response = await client.post("/api/settings/import", json={
            "data": import_data
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["imported_count"] == 1

    @pytest.mark.asyncio
    async def test_import_invalid_schema(self, authenticated_client):
        """Should reject invalid schema version."""
        client, _ = authenticated_client
        
        import_data = {
            "schema_version": 999,
            "api_keys": []
        }
        
        response = await client.post("/api/settings/import", json={
            "data": import_data
        })
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_import_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.post("/api/settings/import", json={
            "data": {"schema_version": 1}
        })
        
        assert response.status_code == 401


class TestRoundtripExportImport:
    """Tests for full export/import cycle."""

    @pytest.mark.asyncio
    async def test_export_import_roundtrip(self, authenticated_client):
        """Should successfully roundtrip export and import."""
        client, _ = authenticated_client
        
        # Create API keys
        await client.post("/api/api-keys", json={
            "provider": "openai",
            "key": "sk-roundtrip-test-123"
        })
        await client.post("/api/api-keys", json={
            "provider": "anthropic",
            "key": "sk-ant-roundtrip-456"
        })
        
        # Export
        export_response = await client.get("/api/settings/export")
        assert export_response.status_code == 200
        export_data = export_response.json()["data"]
        
        # Delete keys
        await client.delete("/api/api-keys/openai")
        await client.delete("/api/api-keys/anthropic")
        
        # Verify keys are gone
        keys_response = await client.get("/api/api-keys")
        assert len(keys_response.json()) == 0
        
        # Import
        import_response = await client.post("/api/settings/import", json={
            "data": export_data
        })
        assert import_response.status_code == 200
        assert import_response.json()["imported_count"] == 2
        
        # Verify keys are restored
        keys_response = await client.get("/api/api-keys")
        assert len(keys_response.json()) == 2
