"""
API Keys routes for managing provider API keys.

API keys are encrypted at rest using AES-256 encryption.
They are used to authenticate with LLM providers when running benchmarks.
"""

from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.core.errors import ApiKeyNotFoundError
from app.db.models import (
    ApiKeyCreate, 
    ApiKeyPublic, 
    User, 
    PREDEFINED_PROVIDERS,
    MessageResponse,
    ProviderInfo,
    BenchmarkRequirements,
)
from app.services.api_keys import api_key_service
from app.services.model_discovery import model_discovery_service, ModelInfo, ModelProvider
from app.services.model_capabilities import (
    ModelCapabilities,
    enrich_model_with_capabilities,
    check_model_benchmark_compatibility,
)
from app.services.benchmark_catalog import get_benchmark_requirements

router = APIRouter()


@router.get(
    "/api-keys",
    response_model=List[ApiKeyPublic],
    summary="List API keys",
    description="List all API keys for the current user. Keys are returned with previews only (last 4 characters).",
    responses={
        200: {
            "description": "List of API keys",
            "content": {
                "application/json": {
                    "example": [{
                        "key_id": "550e8400-e29b-41d4-a716-446655440000",
                        "provider": "openai",
                        "key_preview": "...abc123",
                        "custom_env_var": None,
                        "created_at": "2024-01-15T10:30:00Z",
                        "updated_at": "2024-01-15T10:30:00Z"
                    }]
                }
            }
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def list_api_keys(current_user: User = Depends(get_current_user)):
    """
    List all API keys for the current user.
    
    Returns keys with previews only (last 4 characters), never full key values.
    Use this to show which providers the user has configured.
    
    **Requires authentication.**
    """
    return await api_key_service.list_keys(current_user.user_id)


@router.post(
    "/api-keys",
    response_model=ApiKeyPublic,
    summary="Create or update API key",
    description="Create a new API key or update an existing one for a provider.",
    responses={
        200: {
            "description": "API key created/updated",
            "model": ApiKeyPublic,
        },
        401: {
            "description": "Not authenticated",
        },
        422: {
            "description": "Validation error",
        }
    }
)
async def create_or_update_api_key(
    key_create: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Create or update an API key for a provider.
    
    If a key already exists for the provider, it will be replaced.
    The key is encrypted before storage using AES-256 encryption.
    
    **Supported providers include:**
    - OpenAI, Anthropic, Google, Mistral, Groq
    - Together, Fireworks, OpenRouter
    - And 30+ more (see `/api/api-keys/providers`)
    
    **Custom providers:**
    You can use any provider ID. For unknown providers, specify
    `custom_env_var` to set the environment variable name.
    
    **Requires authentication.**
    """
    return await api_key_service.create_or_update_key(
        current_user.user_id, key_create
    )


@router.delete(
    "/api-keys/{provider}",
    response_model=MessageResponse,
    summary="Delete API key",
    description="Delete an API key for a specific provider.",
    responses={
        200: {
            "description": "API key deleted",
            "content": {
                "application/json": {
                    "example": {"status": "deleted"}
                }
            }
        },
        401: {
            "description": "Not authenticated",
        },
        404: {
            "description": "API key not found for this provider",
        }
    }
)
async def delete_api_key(
    provider: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete an API key for a provider.
    
    This permanently removes the stored API key.
    You will need to re-add it to run benchmarks with this provider.
    
    **Requires authentication.**
    """
    deleted = await api_key_service.delete_key(current_user.user_id, provider)
    if not deleted:
        raise ApiKeyNotFoundError(provider)
    return {"status": "deleted"}


@router.get(
    "/api-keys/providers",
    response_model=List[ProviderInfo],
    summary="List supported providers",
    description="List all supported API key providers with their environment variable names and metadata.",
    responses={
        200: {
            "description": "List of supported providers",
            "content": {
                "application/json": {
                    "example": [{
                        "provider": "openai",
                        "env_var": "OPENAI_API_KEY",
                        "display_name": "OpenAI",
                        "color": "#10a37f"
                    }]
                }
            }
        }
    }
)
async def list_providers():
    """
    List all supported API key providers.
    
    Returns metadata for 30+ pre-defined providers including:
    - **provider**: The provider ID to use when creating keys
    - **env_var**: The environment variable name used for this provider
    - **display_name**: Human-readable provider name
    - **color**: Brand color for UI display
    
    This endpoint does not require authentication.
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


def check_compatibility(
    model: ModelInfo, 
    requirements: BenchmarkRequirements
) -> Tuple[bool, Optional[str]]:
    """
    Check if a model meets benchmark requirements.
    
    Args:
        model: The model to check (should have capabilities populated)
        requirements: The benchmark requirements
        
    Returns:
        Tuple of (is_compatible, reason_if_not)
    """
    return check_model_benchmark_compatibility(
        model_capabilities=model.capabilities,
        model_context_length=model.context_length,
        requires_vision=requirements.vision,
        requires_code_execution=requirements.code_execution,
        requires_function_calling=requirements.function_calling,
        min_context_length=requirements.min_context_length,
    )


@router.get(
    "/available-models",
    summary="Get available models",
    description="Get all available models for the current user based on their configured API keys.",
    responses={
        200: {
            "description": "Available models by provider",
            "content": {
                "application/json": {
                    "example": {
                        "providers": [{
                            "provider": "openai",
                            "display_name": "OpenAI",
                            "models": [
                                {"id": "gpt-4o", "name": "GPT-4o"},
                                {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"}
                            ],
                            "error": None
                        }]
                    }
                }
            }
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def get_available_models(
    force_refresh: bool = False,
    include_capabilities: bool = Query(
        False,
        description="Include capability metadata (vision, function_calling, etc.) for each model"
    ),
    current_user: User = Depends(get_current_user)
):
    """
    Get all available models for the current user.
    
    This endpoint dynamically fetches models from each provider's API using
    the user's stored API keys. Results are cached for 1 hour to minimize
    API calls.
    
    **Parameters:**
    - **force_refresh**: If `true`, bypass cache and fetch fresh data from providers
    - **include_capabilities**: If `true`, include capability metadata for each model
      (vision support, function calling, context length, etc.)
    
    **Returns:**
    A list of providers with their available models. If a provider's API
    returns an error, the `error` field will contain the error message.
    
    **Requires authentication.**
    """
    providers = await model_discovery_service.get_available_models(
        current_user.user_id,
        force_refresh=force_refresh
    )
    
    if include_capabilities:
        # Enrich each model with capability information
        for provider in providers:
            provider.models = [
                enrich_model_with_capabilities(model)
                for model in provider.models
            ]
    
    return {"providers": [p.dict() for p in providers]}


@router.get(
    "/compatible-models",
    summary="Get compatible models for a benchmark",
    description="Get models that are compatible with a specific benchmark based on capability requirements.",
    responses={
        200: {
            "description": "Compatible models and incompatibility info",
            "content": {
                "application/json": {
                    "example": {
                        "providers": [{
                            "name": "OpenAI",
                            "provider_key": "openai",
                            "models": [
                                {
                                    "id": "openai/gpt-4o",
                                    "name": "GPT-4o",
                                    "capabilities": {"vision": True, "function_calling": True}
                                }
                            ]
                        }],
                        "incompatible": [
                            {"model_id": "openai/gpt-4", "reason": "Requires vision capability"}
                        ],
                        "requirements": {"vision": True, "function_calling": False, "min_context_length": None}
                    }
                }
            }
        },
        401: {
            "description": "Not authenticated",
        }
    }
)
async def get_compatible_models(
    benchmark: str = Query(
        ...,
        description="The benchmark name to check compatibility for"
    ),
    current_user: User = Depends(get_current_user)
):
    """
    Get models compatible with a specific benchmark.
    
    Filters the user's available models to only those that meet
    the benchmark's capability requirements.
    
    **Parameters:**
    - **benchmark**: The benchmark name to check compatibility for (e.g., "mmlu", "docvqa")
    
    **Returns:**
    - **providers**: List of providers with their compatible models
    - **incompatible**: List of models that were filtered out with reasons
    - **requirements**: The benchmark's capability requirements
    
    **Requires authentication.**
    """
    # Get all available models
    all_providers = await model_discovery_service.get_available_models(
        current_user.user_id
    )
    
    # Get benchmark requirements
    requirements = get_benchmark_requirements(benchmark)
    
    compatible_providers: List[ModelProvider] = []
    incompatible_models: List[dict] = []
    
    for provider in all_providers:
        compatible_models: List[ModelInfo] = []
        
        for model in provider.models:
            # Enrich with capabilities
            enriched = enrich_model_with_capabilities(model)
            
            # Check compatibility
            is_compatible, reason = check_compatibility(enriched, requirements)
            
            if is_compatible:
                compatible_models.append(enriched)
            else:
                incompatible_models.append({
                    "model_id": model.id,
                    "reason": reason
                })
        
        if compatible_models:
            compatible_providers.append(ModelProvider(
                name=provider.name,
                provider_key=provider.provider_key,
                models=compatible_models
            ))
    
    return {
        "providers": [p.dict() for p in compatible_providers],
        "incompatible": incompatible_models,
        "requirements": requirements.dict()
    }
