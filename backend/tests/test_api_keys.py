"""
Tests for API key encryption and storage.

Tests cover:
- Encryption and decryption of API keys
- Key preview generation
- Creating and retrieving API keys
- Provider environment variable mapping
"""

import os

import pytest

# Set test environment before imports
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only-32"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32-chars-xxx"

from app.services.api_keys import (
    ApiKeyService,
    encrypt_api_key,
    decrypt_api_key,
    get_key_preview,
)
from app.db.models import ApiKeyCreate, get_env_var_for_provider


class TestEncryption:
    """Tests for API key encryption/decryption."""

    def test_encrypt_key_returns_different_value(self):
        """Encrypted key should differ from original."""
        original = "sk-test1234567890"
        
        encrypted = encrypt_api_key(original)
        
        assert encrypted != original
        assert len(encrypted) > len(original)

    def test_decrypt_key_returns_original(self):
        """Decrypted key should match original."""
        original = "sk-test1234567890abcdef"
        
        encrypted = encrypt_api_key(original)
        decrypted = decrypt_api_key(encrypted)
        
        assert decrypted == original

    def test_encrypt_same_key_different_output(self):
        """Same key encrypted twice should produce different ciphertexts (due to IV)."""
        key = "sk-myapikey12345"
        
        encrypted1 = encrypt_api_key(key)
        encrypted2 = encrypt_api_key(key)
        
        # Fernet uses random IV, so outputs should differ
        assert encrypted1 != encrypted2
        
        # But both should decrypt to the same value
        assert decrypt_api_key(encrypted1) == decrypt_api_key(encrypted2)

    def test_encrypt_empty_string(self):
        """Should handle empty string."""
        original = ""
        
        encrypted = encrypt_api_key(original)
        decrypted = decrypt_api_key(encrypted)
        
        assert decrypted == original

    def test_encrypt_special_characters(self):
        """Should handle keys with special characters."""
        original = "sk-test!@#$%^&*()_+=[]{}|;':\",./<>?"
        
        encrypted = encrypt_api_key(original)
        decrypted = decrypt_api_key(encrypted)
        
        assert decrypted == original

    def test_encrypt_long_key(self):
        """Should handle long API keys."""
        original = "sk-" + "a" * 200
        
        encrypted = encrypt_api_key(original)
        decrypted = decrypt_api_key(encrypted)
        
        assert decrypted == original


class TestKeyPreview:
    """Tests for key preview generation."""

    def test_preview_normal_key(self):
        """Should show last 4 characters."""
        key = "sk-1234567890abcdef"
        
        preview = get_key_preview(key)
        
        assert preview == "...cdef"

    def test_preview_short_key(self):
        """Should mask very short keys."""
        key = "abc"
        
        preview = get_key_preview(key)
        
        assert preview == "****"

    def test_preview_exactly_four_chars(self):
        """Should mask keys of exactly 4 characters."""
        key = "abcd"
        
        preview = get_key_preview(key)
        
        assert preview == "****"

    def test_preview_five_chars(self):
        """Should show last 4 of 5 character keys."""
        key = "abcde"
        
        preview = get_key_preview(key)
        
        assert preview == "...bcde"


class TestEnvVarMapping:
    """Tests for provider to environment variable mapping."""

    def test_predefined_provider_openai(self):
        """OpenAI should use OPENAI_API_KEY."""
        env_var = get_env_var_for_provider("openai")
        
        assert env_var == "OPENAI_API_KEY"

    def test_predefined_provider_anthropic(self):
        """Anthropic should use ANTHROPIC_API_KEY."""
        env_var = get_env_var_for_provider("anthropic")
        
        assert env_var == "ANTHROPIC_API_KEY"

    def test_predefined_provider_google(self):
        """Google should use GOOGLE_API_KEY."""
        env_var = get_env_var_for_provider("google")
        
        assert env_var == "GOOGLE_API_KEY"

    def test_custom_env_var_override(self):
        """Custom env var should override default."""
        env_var = get_env_var_for_provider("openai", custom_env_var="MY_CUSTOM_KEY")
        
        assert env_var == "MY_CUSTOM_KEY"

    def test_unknown_provider_generates_var(self):
        """Unknown providers should get generated env var."""
        env_var = get_env_var_for_provider("my-custom-provider")
        
        assert env_var == "MY_CUSTOM_PROVIDER_API_KEY"

    def test_unknown_provider_with_spaces(self):
        """Should handle spaces in provider names."""
        env_var = get_env_var_for_provider("my provider")
        
        assert env_var == "MY_PROVIDER_API_KEY"


class TestApiKeyService:
    """Tests for the ApiKeyService class."""

    @pytest.mark.asyncio
    async def test_create_key(self, test_db, sample_api_key_data):
        """Should create a new API key."""
        service = ApiKeyService()
        user_id = "user-123"
        key_create = ApiKeyCreate(**sample_api_key_data)
        
        result = await service.create_or_update_key(user_id, key_create)
        
        assert result is not None
        assert result.provider == sample_api_key_data["provider"]
        assert result.key_preview.endswith(sample_api_key_data["key"][-4:])

    @pytest.mark.asyncio
    async def test_update_existing_key(self, test_db):
        """Should update an existing key for the same provider."""
        service = ApiKeyService()
        user_id = "user-123"
        
        # Create initial key
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="openai", key="sk-oldkey123")
        )
        
        # Update with new key
        result = await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="openai", key="sk-newkey456")
        )
        
        assert result.key_preview == "...y456"

    @pytest.mark.asyncio
    async def test_list_keys(self, test_db):
        """Should list all keys for a user."""
        service = ApiKeyService()
        user_id = "user-123"
        
        # Create multiple keys
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="openai", key="sk-open123")
        )
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="anthropic", key="sk-anthro456")
        )
        
        keys = await service.list_keys(user_id)
        
        assert len(keys) == 2
        providers = {k.provider for k in keys}
        assert "openai" in providers
        assert "anthropic" in providers

    @pytest.mark.asyncio
    async def test_get_key_decrypted(self, test_db, sample_api_key_data):
        """Should retrieve and decrypt a key."""
        service = ApiKeyService()
        user_id = "user-123"
        key_create = ApiKeyCreate(**sample_api_key_data)
        
        await service.create_or_update_key(user_id, key_create)
        
        key = await service.get_key(user_id, sample_api_key_data["provider"])
        
        assert key is not None
        # The key should be stored encrypted
        assert key.encrypted_key != sample_api_key_data["key"]
        # But we can decrypt it
        decrypted = decrypt_api_key(key.encrypted_key)
        assert decrypted == sample_api_key_data["key"]

    @pytest.mark.asyncio
    async def test_delete_key(self, test_db, sample_api_key_data):
        """Should delete a key."""
        service = ApiKeyService()
        user_id = "user-123"
        
        # Create key
        await service.create_or_update_key(user_id, ApiKeyCreate(**sample_api_key_data))
        
        # Delete key
        result = await service.delete_key(user_id, sample_api_key_data["provider"])
        
        assert result is True
        
        # Verify it's gone
        key = await service.get_key(user_id, sample_api_key_data["provider"])
        assert key is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_key(self, test_db):
        """Should return False when deleting non-existent key."""
        service = ApiKeyService()
        
        result = await service.delete_key("user-123", "nonexistent")
        
        assert result is False

    @pytest.mark.asyncio
    async def test_get_decrypted_keys_for_run(self, test_db):
        """Should get all keys as env vars for running benchmarks."""
        service = ApiKeyService()
        user_id = "user-123"
        
        # Create keys for multiple providers
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="openai", key="sk-openai-key")
        )
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(provider="anthropic", key="sk-anthropic-key")
        )
        
        env_vars = await service.get_decrypted_keys_for_run(user_id)
        
        assert "OPENAI_API_KEY" in env_vars
        assert env_vars["OPENAI_API_KEY"] == "sk-openai-key"
        assert "ANTHROPIC_API_KEY" in env_vars
        assert env_vars["ANTHROPIC_API_KEY"] == "sk-anthropic-key"

    @pytest.mark.asyncio
    async def test_custom_env_var_in_run(self, test_db):
        """Should use custom env var name in run environment."""
        service = ApiKeyService()
        user_id = "user-123"
        
        await service.create_or_update_key(
            user_id,
            ApiKeyCreate(
                provider="openai",
                key="sk-custom-key",
                custom_env_var="MY_OPENAI_KEY"
            )
        )
        
        env_vars = await service.get_decrypted_keys_for_run(user_id)
        
        assert "MY_OPENAI_KEY" in env_vars
        assert env_vars["MY_OPENAI_KEY"] == "sk-custom-key"

    @pytest.mark.asyncio
    async def test_key_isolation_between_users(self, test_db):
        """Keys should be isolated between users."""
        service = ApiKeyService()
        
        # User 1 creates a key
        await service.create_or_update_key(
            "user-1",
            ApiKeyCreate(provider="openai", key="sk-user1-key")
        )
        
        # User 2 creates a key for the same provider
        await service.create_or_update_key(
            "user-2",
            ApiKeyCreate(provider="openai", key="sk-user2-key")
        )
        
        # Each user should only see their own key
        user1_keys = await service.list_keys("user-1")
        user2_keys = await service.list_keys("user-2")
        
        assert len(user1_keys) == 1
        assert len(user2_keys) == 1
        
        # Verify the keys are different
        user1_env = await service.get_decrypted_keys_for_run("user-1")
        user2_env = await service.get_decrypted_keys_for_run("user-2")
        
        assert user1_env["OPENAI_API_KEY"] == "sk-user1-key"
        assert user2_env["OPENAI_API_KEY"] == "sk-user2-key"
