"""
API Keys routes for managing provider API keys.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.models import ApiKeyCreate, ApiKeyProvider, ApiKeyPublic, User, PROVIDER_ENV_VARS
from app.services.api_keys import api_key_service

router = APIRouter()


@router.get("/api-keys", response_model=list[ApiKeyPublic])
async def list_api_keys(current_user: User = Depends(get_current_user)):
    """
    List all API keys for the current user.
    
    Returns keys with previews only (last 4 characters), never full keys.
    """
    return await api_key_service.list_keys(current_user.user_id)


@router.post("/api-keys", response_model=ApiKeyPublic)
async def create_or_update_api_key(
    key_create: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Create or update an API key for a provider.
    
    If a key already exists for the provider, it will be replaced.
    """
    return await api_key_service.create_or_update_key(
        current_user.user_id, key_create
    )


@router.delete("/api-keys/{provider}")
async def delete_api_key(
    provider: ApiKeyProvider,
    current_user: User = Depends(get_current_user),
):
    """
    Delete an API key for a provider.
    """
    deleted = await api_key_service.delete_key(current_user.user_id, provider)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No API key found for provider: {provider.value}",
        )
    return {"status": "deleted"}


@router.get("/api-keys/providers")
async def list_providers():
    """
    List all supported API key providers with their environment variable names.
    """
    return [
        {
            "provider": provider.value,
            "env_var": env_var,
            "display_name": provider.value.replace("_", " ").title(),
        }
        for provider, env_var in PROVIDER_ENV_VARS.items()
    ]



