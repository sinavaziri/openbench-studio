"""
Model discovery service - dynamically fetch available models from provider APIs.

This service queries each provider's API to get a list of available models
based on the user's stored API keys.

Features:
- Automatic retry with exponential backoff on transient errors
- Provider-specific retry configurations
- Comprehensive logging for debugging
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum

import httpx
from pydantic import BaseModel

from app.core.retry import (
    with_retry,
    get_retry_config,
    is_retryable_status_code,
    RetryableError,
    NonRetryableError,
)
from app.db.models import ApiKeyProvider
from app.services.api_keys import api_key_service

logger = logging.getLogger(__name__)


class ModelCapabilities(BaseModel):
    """Model capability flags for compatibility matching."""
    vision: bool = False              # Can process images
    code_execution: bool = False      # Has code interpreter
    function_calling: bool = False    # Supports function/tool calling
    json_mode: bool = False           # Supports structured JSON output
    streaming: bool = True            # Supports streaming responses


class ModelPricing(BaseModel):
    """Pricing information for cost estimation."""
    input_per_1m: Optional[float] = None   # $ per 1M input tokens
    output_per_1m: Optional[float] = None  # $ per 1M output tokens
    currency: str = "USD"


class ModelInfo(BaseModel):
    """Information about a single model."""
    id: str
    name: str
    description: Optional[str] = None
    context_length: Optional[int] = None  # Max tokens (input + output)
    capabilities: ModelCapabilities = ModelCapabilities()
    pricing: Optional[ModelPricing] = None  # Future: cost estimation


class ModelProvider(BaseModel):
    """A provider and its available models."""
    name: str
    provider_key: str
    models: List[ModelInfo]


@dataclass
class ProviderConfig:
    """Configuration for a provider's API."""
    name: str
    base_url: str
    models_endpoint: str
    auth_header: str = "Authorization"
    auth_prefix: str = "Bearer "
    timeout: int = 10
    use_static_list: bool = False  # Some providers don't have list endpoints


@dataclass
class CacheEntry:
    """Cached models with expiration."""
    providers: List[ModelProvider]
    expires_at: datetime


class ModelDiscoveryService:
    """
    Service for discovering available models from provider APIs.
    
    Features:
    - Fetches models dynamically from provider APIs
    - Caches results per user (1 hour TTL)
    - Handles errors gracefully (invalid keys, timeouts, etc.)
    - Parallel fetching for better performance
    - Static fallback lists for providers without listing APIs
    """
    
    # Cache TTL: 1 hour
    CACHE_TTL_SECONDS = 3600
    
    # Provider configurations
    PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
        "openai": ProviderConfig(
            name="OpenAI",
            base_url="https://api.openai.com",
            models_endpoint="/v1/models",
        ),
        "google": ProviderConfig(
            name="Google",
            base_url="https://generativelanguage.googleapis.com",
            models_endpoint="/v1/models",
            auth_header="x-goog-api-key",
            auth_prefix="",
        ),
        "mistral": ProviderConfig(
            name="Mistral AI",
            base_url="https://api.mistral.ai",
            models_endpoint="/v1/models",
        ),
        "groq": ProviderConfig(
            name="Groq",
            base_url="https://api.groq.com/openai",
            models_endpoint="/v1/models",
        ),
        "together": ProviderConfig(
            name="Together AI",
            base_url="https://api.together.xyz",
            models_endpoint="/v1/models",
        ),
        "cohere": ProviderConfig(
            name="Cohere",
            base_url="https://api.cohere.ai",
            models_endpoint="/v1/models",
            auth_header="Authorization",
            auth_prefix="Bearer ",
        ),
        "fireworks": ProviderConfig(
            name="Fireworks AI",
            base_url="https://api.fireworks.ai/inference",
            models_endpoint="/v1/models",
        ),
        "openrouter": ProviderConfig(
            name="OpenRouter",
            base_url="https://openrouter.ai/api",
            models_endpoint="/v1/models",
        ),
        "anthropic": ProviderConfig(
            name="Anthropic",
            base_url="",
            models_endpoint="",
            use_static_list=True,  # Anthropic doesn't have a public list endpoint
        ),
    }
    
    # Static model lists for providers without listing APIs
    STATIC_MODELS: Dict[str, List[ModelInfo]] = {
        "anthropic": [
            ModelInfo(id="anthropic/claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet (Oct 2024)", description="Latest and most capable"),
            ModelInfo(id="anthropic/claude-3-5-sonnet-20240620", name="Claude 3.5 Sonnet (Jun 2024)", description="Previous version"),
            ModelInfo(id="anthropic/claude-3-opus-20240229", name="Claude 3 Opus", description="Most powerful, 200k context"),
            ModelInfo(id="anthropic/claude-3-sonnet-20240229", name="Claude 3 Sonnet", description="Balanced performance"),
            ModelInfo(id="anthropic/claude-3-haiku-20240307", name="Claude 3 Haiku", description="Fastest and compact"),
            ModelInfo(id="anthropic/claude-2.1", name="Claude 2.1", description="200k context window"),
            ModelInfo(id="anthropic/claude-2", name="Claude 2", description="Previous generation"),
            ModelInfo(id="anthropic/claude-instant-1.2", name="Claude Instant 1.2", description="Fast and affordable"),
        ],
    }
    
    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
    
    async def get_available_models(self, user_id: str, force_refresh: bool = False) -> List[ModelProvider]:
        """
        Get available models for a user based on their API keys.
        
        Args:
            user_id: The user's ID
            force_refresh: If True, bypass cache and fetch fresh data
            
        Returns:
            List of ModelProvider objects with available models
        """
        # Check cache
        now = datetime.utcnow()
        cache_key = f"models:{user_id}"
        
        if not force_refresh and cache_key in self._cache:
            entry = self._cache[cache_key]
            if entry.expires_at > now:
                return entry.providers
        
        # Get user's API keys
        api_keys = await api_key_service.list_keys(user_id)
        
        if not api_keys:
            # No API keys, return only custom option
            return [
                ModelProvider(
                    name="Custom",
                    provider_key="custom",
                    models=[
                        ModelInfo(id="custom", name="Custom Model", description="Enter custom model identifier")
                    ]
                )
            ]
        
        # Fetch models from each provider in parallel
        tasks = []
        for api_key_info in api_keys:
            provider = api_key_info.provider
            if provider in self.PROVIDER_CONFIGS:
                tasks.append(self._fetch_provider_models(user_id, provider))
        
        # Wait for all fetches to complete (don't fail if some providers fail)
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out errors and None results
        providers = []
        for result in results:
            if isinstance(result, ModelProvider) and result.models:
                providers.append(result)
            elif isinstance(result, Exception):
                # Log error but continue
                print(f"Error fetching models: {result}")
        
        # Always add custom option at the end
        providers.append(
            ModelProvider(
                name="Custom",
                provider_key="custom",
                models=[
                    ModelInfo(id="custom", name="Custom Model", description="Enter custom model identifier")
                ]
            )
        )
        
        # Cache the results
        self._cache[cache_key] = CacheEntry(
            providers=providers,
            expires_at=now + timedelta(seconds=self.CACHE_TTL_SECONDS)
        )
        
        return providers
    
    async def _fetch_provider_models(self, user_id: str, provider: ApiKeyProvider) -> Optional[ModelProvider]:
        """
        Fetch models from a specific provider.
        
        Args:
            user_id: The user's ID
            provider: The provider to fetch from
            
        Returns:
            ModelProvider object or None if fetch fails
        """
        config = self.PROVIDER_CONFIGS.get(provider)
        if not config:
            return None
        
        # Use static list if provider doesn't have an API endpoint
        if config.use_static_list:
            static_models = self.STATIC_MODELS.get(provider, [])
            if static_models:
                return ModelProvider(
                    name=config.name,
                    provider_key=provider,
                    models=static_models
                )
            return None
        
        # Get the decrypted API key
        api_key = await api_key_service.get_key(user_id, provider)
        if not api_key:
            return None
        
        from app.services.api_keys import decrypt_api_key
        try:
            decrypted_key = decrypt_api_key(api_key.encrypted_key)
        except Exception as e:
            print(f"Failed to decrypt API key for {provider}: {e}")
            return None
        
        # Make API request with retry logic
        async def _make_request() -> Optional[ModelProvider]:
            async with httpx.AsyncClient(timeout=config.timeout) as client:
                headers = {
                    config.auth_header: f"{config.auth_prefix}{decrypted_key}"
                }
                
                url = f"{config.base_url}{config.models_endpoint}"
                response = await client.get(url, headers=headers)
                
                # Check for non-retryable errors
                if response.status_code in {400, 401, 403, 404}:
                    logger.warning(
                        f"Non-retryable error from {provider}: HTTP {response.status_code}"
                    )
                    raise NonRetryableError(
                        f"Failed to fetch models: HTTP {response.status_code}",
                        status_code=response.status_code,
                        provider=provider,
                    )
                
                # Check for retryable errors
                if response.status_code != 200:
                    if is_retryable_status_code(response.status_code):
                        raise RetryableError(
                            f"Failed to fetch models: HTTP {response.status_code}",
                            status_code=response.status_code,
                            provider=provider,
                        )
                    logger.warning(
                        f"Failed to fetch models from {provider}: HTTP {response.status_code}"
                    )
                    return None
                
                data = response.json()
                models = self._parse_models_response(provider, data)
                
                if models:
                    return ModelProvider(
                        name=config.name,
                        provider_key=provider,
                        models=models
                    )
                return None
        
        def _on_retry(attempt: int, delay: float, exc: Exception):
            status_code = getattr(exc, 'status_code', None)
            logger.info(
                f"Retrying model fetch for {provider} "
                f"(attempt {attempt}, delay {delay:.2f}s, status: {status_code})"
            )
        
        try:
            return await with_retry(
                _make_request,
                provider=provider,
                operation_name=f"fetch_models({provider})",
                on_retry=_on_retry,
            )
        except NonRetryableError as e:
            logger.warning(f"Non-retryable error for {provider}: {e}")
            return None
        except RetryableError as e:
            logger.error(
                f"Failed to fetch models from {provider} after retries: {e}"
            )
            return None
        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching models from {provider}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching models from {provider}: {e}")
            return None
    
    def _parse_models_response(self, provider: ApiKeyProvider, data: Any) -> List[ModelInfo]:
        """
        Parse the models response from a provider API.
        
        Different providers have different response formats, so we need
        to handle each one appropriately.
        
        Args:
            provider: The provider the response is from
            data: The JSON response data
            
        Returns:
            List of ModelInfo objects
        """
        models = []
        
        try:
            # Handle different response formats:
            # - OpenAI/Mistral/etc: {"data": [...]}
            # - Google: {"models": [...]}
            # - Some providers: [...]
            if isinstance(data, dict) and "data" in data:
                model_list = data["data"]
            elif isinstance(data, dict) and "models" in data:
                model_list = data["models"]
            elif isinstance(data, list):
                model_list = data
            else:
                return models
            
            for item in model_list:
                if isinstance(item, dict):
                    # Handle different ID field names
                    model_id = item.get("id") or item.get("name")
                    if not model_id:
                        continue
                    
                    # For Google, filter out non-generative models (embeddings, etc.)
                    if provider == "google":
                        # Check if this model supports content generation
                        supported_methods = item.get("supportedGenerationMethods", [])
                        if supported_methods and "generateContent" not in supported_methods:
                            # Skip models that don't support generateContent (e.g., embedding models)
                            continue
                    
                    # For Google, the "name" field is like "models/gemini-pro"
                    # We want to extract just the model name part
                    if provider == "google" and model_id.startswith("models/"):
                        clean_id = model_id.split("models/", 1)[1]
                        model_id = f"{provider}/{clean_id}"
                    # Prefix model ID with provider if not already prefixed
                    elif "/" not in model_id:
                        model_id = f"{provider}/{model_id}"
                    
                    # Extract name and description (handle different field name formats)
                    name = (item.get("displayName") or  # Google uses displayName
                            item.get("display_name") or  # Others use display_name
                            item.get("name") or 
                            model_id.split("/")[-1])
                    description = item.get("description") or item.get("summary")
                    
                    # Clean up description (truncate if too long)
                    if description and len(description) > 100:
                        description = description[:97] + "..."
                    
                    models.append(ModelInfo(
                        id=model_id,
                        name=name,
                        description=description
                    ))
                elif isinstance(item, str):
                    # Simple string list
                    model_id = item if "/" in item else f"{provider}/{item}"
                    models.append(ModelInfo(
                        id=model_id,
                        name=item,
                    ))
        
        except Exception as e:
            print(f"Error parsing models response for {provider}: {e}")
        
        return models
    
    def clear_cache(self, user_id: Optional[str] = None) -> None:
        """
        Clear cached models.
        
        Args:
            user_id: If provided, clear only this user's cache. Otherwise clear all.
        """
        if user_id:
            cache_key = f"models:{user_id}"
            self._cache.pop(cache_key, None)
        else:
            self._cache.clear()


# Global instance
model_discovery_service = ModelDiscoveryService()

