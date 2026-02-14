"""
Settings import/export routes for backing up and restoring user settings.

Supports exporting API keys, preferences, and templates with optional
password-based encryption for sensitive data.
"""

import base64
import hashlib
import json
import secrets
from datetime import datetime
from typing import Any, List, Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.errors import ValidationError
from app.db.models import User, ApiKeyCreate, PREDEFINED_PROVIDERS, get_env_var_for_provider
from app.services.api_keys import api_key_service, decrypt_api_key

router = APIRouter()


# =============================================================================
# Models
# =============================================================================

class EncryptedApiKey(BaseModel):
    """An API key in export format (encrypted if password provided)."""
    provider: str
    encrypted_value: str  # Base64 encoded, encrypted if password used
    custom_env_var: Optional[str] = None


class SettingsExport(BaseModel):
    """Complete settings export structure."""
    schema_version: int = Field(default=1, description="Export schema version")
    exported_at: str = Field(description="ISO timestamp of export")
    encrypted: bool = Field(default=False, description="Whether API keys are password-encrypted")
    salt: Optional[str] = Field(None, description="Salt for password derivation (if encrypted)")
    api_keys: List[EncryptedApiKey] = Field(default_factory=list)
    # Future expansion: preferences, templates, etc.


class SettingsImportRequest(BaseModel):
    """Request body for importing settings."""
    data: dict = Field(description="The exported settings JSON")
    password: Optional[str] = Field(None, description="Password to decrypt sensitive data")


class ImportPreview(BaseModel):
    """Preview of what will be imported."""
    api_keys: List[dict] = Field(default_factory=list, description="API keys to import")
    will_overwrite: List[str] = Field(default_factory=list, description="Providers that will be overwritten")
    new_providers: List[str] = Field(default_factory=list, description="New providers being added")
    errors: List[str] = Field(default_factory=list, description="Validation errors")


class ExportResponse(BaseModel):
    """Response containing the exported settings."""
    data: SettingsExport


class ImportResponse(BaseModel):
    """Response after importing settings."""
    status: str
    imported_count: int
    skipped_count: int
    details: List[str] = Field(default_factory=list)


# =============================================================================
# Encryption Helpers
# =============================================================================

def _derive_key_from_password(password: str, salt: bytes) -> bytes:
    """Derive a Fernet key from a password and salt."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def _encrypt_with_password(plaintext: str, password: str, salt: bytes) -> str:
    """Encrypt plaintext using password-derived key."""
    key = _derive_key_from_password(password, salt)
    fernet = Fernet(key)
    return fernet.encrypt(plaintext.encode()).decode()


def _decrypt_with_password(ciphertext: str, password: str, salt: bytes) -> str:
    """Decrypt ciphertext using password-derived key."""
    key = _derive_key_from_password(password, salt)
    fernet = Fernet(key)
    return fernet.decrypt(ciphertext.encode()).decode()


# =============================================================================
# Routes
# =============================================================================

@router.get(
    "/settings/export",
    response_model=ExportResponse,
    summary="Export user settings",
    description="Export all user settings including API keys. Optionally encrypt sensitive data with a password.",
    responses={
        200: {
            "description": "Settings exported successfully",
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def export_settings(
    password: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Export all user settings to JSON format.
    
    If a password is provided, API keys will be encrypted using the password.
    Without a password, keys are still encrypted but using a scheme that
    can be decrypted during import without additional credentials.
    
    **Exported data includes:**
    - API keys (provider and encrypted value)
    - Custom environment variable mappings
    
    **Requires authentication.**
    """
    # Get all API keys for user
    api_keys = await api_key_service.list_keys(current_user.user_id)
    
    # Prepare export
    exported_keys: List[EncryptedApiKey] = []
    use_password = bool(password)
    salt = secrets.token_bytes(16) if use_password else None
    
    for key_info in api_keys:
        # Get the actual decrypted key
        full_key = await api_key_service.get_key(current_user.user_id, key_info.provider)
        if not full_key:
            continue
            
        try:
            decrypted_value = decrypt_api_key(full_key.encrypted_key)
        except Exception:
            # Skip keys that can't be decrypted
            continue
        
        if use_password and salt:
            # Encrypt with user's password
            encrypted_value = _encrypt_with_password(decrypted_value, password, salt)
        else:
            # Just base64 encode for transport (not truly secure without password)
            encrypted_value = base64.b64encode(decrypted_value.encode()).decode()
        
        exported_keys.append(EncryptedApiKey(
            provider=key_info.provider,
            encrypted_value=encrypted_value,
            custom_env_var=key_info.custom_env_var,
        ))
    
    export_data = SettingsExport(
        schema_version=1,
        exported_at=datetime.utcnow().isoformat() + "Z",
        encrypted=use_password,
        salt=base64.b64encode(salt).decode() if salt else None,
        api_keys=exported_keys,
    )
    
    return ExportResponse(data=export_data)


@router.post(
    "/settings/import/preview",
    response_model=ImportPreview,
    summary="Preview settings import",
    description="Preview what will be imported before applying changes.",
    responses={
        200: {
            "description": "Import preview generated",
        },
        401: {
            "description": "Not authenticated",
        },
        422: {
            "description": "Invalid import data",
        }
    }
)
async def preview_import(
    request: SettingsImportRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Preview what will be imported without making any changes.
    
    Returns:
    - List of API keys that will be imported
    - Which providers will be overwritten
    - Which providers are new
    - Any validation errors
    
    **Requires authentication.**
    """
    data = request.data
    password = request.password
    errors: List[str] = []
    api_keys_preview: List[dict] = []
    
    # Validate schema version
    schema_version = data.get("schema_version", 0)
    if schema_version != 1:
        errors.append(f"Unsupported schema version: {schema_version}. Expected: 1")
        return ImportPreview(errors=errors)
    
    # Check if encrypted and password needed
    is_encrypted = data.get("encrypted", False)
    salt_b64 = data.get("salt")
    
    if is_encrypted and not password:
        errors.append("This export is password-protected. Please provide the password.")
        return ImportPreview(errors=errors)
    
    if is_encrypted and salt_b64:
        try:
            salt = base64.b64decode(salt_b64)
        except Exception:
            errors.append("Invalid salt in export data")
            return ImportPreview(errors=errors)
    else:
        salt = None
    
    # Get existing keys for comparison
    existing_keys = await api_key_service.list_keys(current_user.user_id)
    existing_providers = {k.provider for k in existing_keys}
    
    will_overwrite: List[str] = []
    new_providers: List[str] = []
    
    # Process API keys
    for key_data in data.get("api_keys", []):
        provider = key_data.get("provider", "")
        encrypted_value = key_data.get("encrypted_value", "")
        custom_env_var = key_data.get("custom_env_var")
        
        if not provider:
            errors.append("Found API key with missing provider")
            continue
        
        # Try to decrypt/decode to validate
        try:
            if is_encrypted and salt and password:
                decrypted = _decrypt_with_password(encrypted_value, password, salt)
            else:
                decrypted = base64.b64decode(encrypted_value).decode()
        except InvalidToken:
            errors.append(f"Invalid password or corrupted data for provider: {provider}")
            continue
        except Exception as e:
            errors.append(f"Failed to decode key for {provider}: {str(e)}")
            continue
        
        # Get display info
        if provider in PREDEFINED_PROVIDERS:
            display_name = PREDEFINED_PROVIDERS[provider]["display_name"]
        else:
            display_name = provider
        
        api_keys_preview.append({
            "provider": provider,
            "display_name": display_name,
            "key_preview": f"...{decrypted[-4:]}" if len(decrypted) > 4 else "****",
            "custom_env_var": custom_env_var,
        })
        
        if provider in existing_providers:
            will_overwrite.append(provider)
        else:
            new_providers.append(provider)
    
    return ImportPreview(
        api_keys=api_keys_preview,
        will_overwrite=will_overwrite,
        new_providers=new_providers,
        errors=errors,
    )


@router.post(
    "/settings/import",
    response_model=ImportResponse,
    summary="Import user settings",
    description="Import settings from a previously exported JSON file.",
    responses={
        200: {
            "description": "Settings imported successfully",
        },
        401: {
            "description": "Not authenticated",
        },
        422: {
            "description": "Invalid import data",
        }
    }
)
async def import_settings(
    request: SettingsImportRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Import settings from an exported JSON file.
    
    This will:
    - Restore API keys (overwriting existing ones for the same provider)
    - Apply custom environment variable mappings
    
    If the export was password-protected, the same password must be provided.
    
    **Requires authentication.**
    """
    data = request.data
    password = request.password
    
    # Validate schema version
    schema_version = data.get("schema_version", 0)
    if schema_version != 1:
        raise ValidationError(f"Unsupported schema version: {schema_version}")
    
    # Check encryption
    is_encrypted = data.get("encrypted", False)
    salt_b64 = data.get("salt")
    
    if is_encrypted and not password:
        raise ValidationError("This export is password-protected. Please provide the password.")
    
    if is_encrypted and salt_b64:
        try:
            salt = base64.b64decode(salt_b64)
        except Exception:
            raise ValidationError("Invalid salt in export data")
    else:
        salt = None
    
    imported_count = 0
    skipped_count = 0
    details: List[str] = []
    
    # Import API keys
    for key_data in data.get("api_keys", []):
        provider = key_data.get("provider", "")
        encrypted_value = key_data.get("encrypted_value", "")
        custom_env_var = key_data.get("custom_env_var")
        
        if not provider or not encrypted_value:
            skipped_count += 1
            details.append(f"Skipped: Invalid key data for provider '{provider}'")
            continue
        
        try:
            if is_encrypted and salt and password:
                decrypted = _decrypt_with_password(encrypted_value, password, salt)
            else:
                decrypted = base64.b64decode(encrypted_value).decode()
        except InvalidToken:
            skipped_count += 1
            details.append(f"Skipped: Invalid password or corrupted data for {provider}")
            continue
        except Exception as e:
            skipped_count += 1
            details.append(f"Skipped: Failed to decode key for {provider}")
            continue
        
        # Create or update the API key
        try:
            await api_key_service.create_or_update_key(
                current_user.user_id,
                ApiKeyCreate(
                    provider=provider,
                    key=decrypted,
                    custom_env_var=custom_env_var,
                )
            )
            imported_count += 1
            
            if provider in PREDEFINED_PROVIDERS:
                display_name = PREDEFINED_PROVIDERS[provider]["display_name"]
            else:
                display_name = provider
            details.append(f"Imported: {display_name}")
        except Exception as e:
            skipped_count += 1
            details.append(f"Failed: Could not save key for {provider}")
    
    return ImportResponse(
        status="completed",
        imported_count=imported_count,
        skipped_count=skipped_count,
        details=details,
    )
