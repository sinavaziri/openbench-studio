"""
API Key service for secure storage and retrieval of provider API keys.

Keys are encrypted at rest using AES-256 encryption.
"""

import base64
from datetime import datetime
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import ENCRYPTION_KEY
from app.db.models import ApiKey, ApiKeyCreate, ApiKeyProvider, ApiKeyPublic, PROVIDER_ENV_VARS
from app.db.session import get_db


def _get_fernet() -> Fernet:
    """Get a Fernet instance for encryption/decryption."""
    # Derive a proper key from our secret using PBKDF2
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"openbench_salt_v1",  # Fixed salt is OK since we have a unique key
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
    return Fernet(key)


def encrypt_api_key(key: str) -> str:
    """Encrypt an API key for storage."""
    fernet = _get_fernet()
    return fernet.encrypt(key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key from storage."""
    fernet = _get_fernet()
    return fernet.decrypt(encrypted_key.encode()).decode()


def get_key_preview(key: str) -> str:
    """Get a preview of an API key (last 4 characters)."""
    if len(key) <= 4:
        return "****"
    return f"...{key[-4:]}"


class ApiKeyService:
    """Service for managing API keys."""

    async def create_or_update_key(
        self, user_id: str, key_create: ApiKeyCreate
    ) -> ApiKeyPublic:
        """Create or update an API key for a provider."""
        encrypted = encrypt_api_key(key_create.key)
        preview = get_key_preview(key_create.key)
        now = datetime.utcnow()

        async with get_db() as db:
            # Check if key exists for this user/provider
            cursor = await db.execute(
                "SELECT key_id FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, key_create.provider.value),
            )
            existing = await cursor.fetchone()

            if existing:
                # Update existing key
                await db.execute(
                    """
                    UPDATE api_keys 
                    SET encrypted_key = ?, key_preview = ?, updated_at = ?
                    WHERE user_id = ? AND provider = ?
                    """,
                    (encrypted, preview, now.isoformat(), user_id, key_create.provider.value),
                )
                key_id = existing["key_id"]
            else:
                # Create new key
                key = ApiKey(
                    user_id=user_id,
                    provider=key_create.provider,
                    encrypted_key=encrypted,
                    key_preview=preview,
                    created_at=now,
                    updated_at=now,
                )
                await db.execute(
                    """
                    INSERT INTO api_keys 
                    (key_id, user_id, provider, encrypted_key, key_preview, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key.key_id,
                        key.user_id,
                        key.provider.value,
                        key.encrypted_key,
                        key.key_preview,
                        key.created_at.isoformat(),
                        key.updated_at.isoformat(),
                    ),
                )
                key_id = key.key_id

            await db.commit()

            # Return the public view
            cursor = await db.execute(
                "SELECT * FROM api_keys WHERE key_id = ?", (key_id,)
            )
            row = await cursor.fetchone()
            return self._row_to_public(row)

    async def list_keys(self, user_id: str) -> list[ApiKeyPublic]:
        """List all API keys for a user (without actual key values)."""
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM api_keys WHERE user_id = ? ORDER BY provider",
                (user_id,),
            )
            rows = await cursor.fetchall()
            return [self._row_to_public(row) for row in rows]

    async def get_key(self, user_id: str, provider: ApiKeyProvider) -> Optional[ApiKey]:
        """Get a full API key (including decrypted value) for a user and provider."""
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, provider.value),
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_key(row)

    async def delete_key(self, user_id: str, provider: ApiKeyProvider) -> bool:
        """Delete an API key. Returns True if deleted, False if not found."""
        async with get_db() as db:
            cursor = await db.execute(
                "DELETE FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, provider.value),
            )
            await db.commit()
            return cursor.rowcount > 0

    async def get_decrypted_keys_for_run(self, user_id: str) -> dict[str, str]:
        """
        Get all decrypted API keys for a user as environment variables.
        
        Returns a dict mapping env var names to decrypted key values.
        """
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT provider, encrypted_key FROM api_keys WHERE user_id = ?",
                (user_id,),
            )
            rows = await cursor.fetchall()
            
            env_vars = {}
            for row in rows:
                provider = ApiKeyProvider(row["provider"])
                env_var_name = PROVIDER_ENV_VARS.get(provider)
                if env_var_name:
                    try:
                        decrypted = decrypt_api_key(row["encrypted_key"])
                        env_vars[env_var_name] = decrypted
                    except Exception:
                        pass  # Skip keys that fail to decrypt
            
            return env_vars

    def _row_to_key(self, row) -> ApiKey:
        """Convert a database row to an ApiKey model."""
        return ApiKey(
            key_id=row["key_id"],
            user_id=row["user_id"],
            provider=ApiKeyProvider(row["provider"]),
            encrypted_key=row["encrypted_key"],
            key_preview=row["key_preview"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _row_to_public(self, row) -> ApiKeyPublic:
        """Convert a database row to an ApiKeyPublic model."""
        return ApiKeyPublic(
            key_id=row["key_id"],
            provider=ApiKeyProvider(row["provider"]),
            key_preview=row["key_preview"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )


# Global instance
api_key_service = ApiKeyService()



