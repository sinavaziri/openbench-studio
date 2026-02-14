"""
API Keys routes for managing provider API keys.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.errors import ApiKeyNotFoundError
from app.db.models import ApiKeyCreate, ApiKeyPublic, User, PREDEFINED_PROVIDERS
from app.services.api_keys import api_key_service
from app.services.model_discovery import model_discovery_service

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
    provider: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete an API key for a provider.
    """
    deleted = await api_key_service.delete_key(current_user.user_id, provider)
    if not deleted:
        raise ApiKeyNotFoundError(provider)
    return {"status": "deleted"}


@router.get("/api-keys/providers")
async def list_providers():
    """
    List all supported API key providers with their environment variable names and metadata.
    
    Returns all 30+ pre-defined providers from openbench.dev.
    """
    return [
        {
            "provider": provider_id,
            "env_var": info["env_var"],
            "display_name": info["display_name"],
            "color": info["color"],
        }
        for provider_id, info in PREDEFINED_PROVIDERS.items()
    ]


@router.get("/available-models")
async def get_available_models(
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Get all available models for the current user based on their API keys.
    
    This endpoint dynamically fetches models from each provider's API using
    the user's stored API keys. Results are cached for 1 hour to minimize
    API calls.
    
    Args:
        force_refresh: If True, bypass cache and fetch fresh data
        current_user: The authenticated user
        
    Returns:
        List of providers with their available models
    """
    providers = await model_discovery_service.get_available_models(
        current_user.user_id,
        force_refresh=force_refresh
    )
    
    return {"providers": [p.dict() for p in providers]}



