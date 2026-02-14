"""
Model capability detection and mapping.

This service provides capability metadata for AI models, enabling
intelligent model-benchmark compatibility matching.

Sources:
1. Static KNOWN_CAPABILITIES dictionary for well-known models
2. Heuristic detection from model names/patterns
3. Future: Provider API metadata parsing
"""

from typing import Dict, Optional, TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.services.model_discovery import ModelInfo


class ModelCapabilities(BaseModel):
    """Model capability flags for compatibility matching."""
    vision: bool = False              # Can process images
    code_execution: bool = False      # Has code interpreter
    function_calling: bool = False    # Supports function/tool calling
    json_mode: bool = False           # Supports structured JSON output
    streaming: bool = True            # Supports streaming responses


# Known model capabilities (provider/model-id → capabilities + context_length)
# This dictionary maps full model IDs to their known capabilities.
# Context length is stored separately for cleaner capability checks.
KNOWN_CAPABILITIES: Dict[str, Dict] = {
    # ==========================================================================
    # OpenAI Models
    # ==========================================================================
    "openai/gpt-4o": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4o-mini": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4o-2024-11-20": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4o-2024-08-06": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4o-2024-05-13": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4-turbo": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4-turbo-2024-04-09": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4-turbo-preview": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "openai/gpt-4": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 8192,
    },
    "openai/gpt-4-32k": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32768,
    },
    "openai/gpt-3.5-turbo": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 16385,
    },
    "openai/gpt-3.5-turbo-16k": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 16385,
    },
    # OpenAI o-series (reasoning models)
    "openai/o1": {
        "capabilities": ModelCapabilities(vision=True, function_calling=False, json_mode=False, streaming=False),
        "context_length": 200000,
    },
    "openai/o1-preview": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False, streaming=False),
        "context_length": 128000,
    },
    "openai/o1-mini": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False, streaming=False),
        "context_length": 128000,
    },
    "openai/o3-mini": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True, streaming=True),
        "context_length": 200000,
    },
    
    # ==========================================================================
    # Anthropic Models
    # ==========================================================================
    "anthropic/claude-3-5-sonnet-20241022": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-3-5-sonnet-20240620": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-3-5-haiku-20241022": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-3-opus-20240229": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-3-sonnet-20240229": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-3-haiku-20240307": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "anthropic/claude-2.1": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 200000,
    },
    "anthropic/claude-2": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 100000,
    },
    "anthropic/claude-instant-1.2": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 100000,
    },
    
    # ==========================================================================
    # Google Models
    # ==========================================================================
    "google/gemini-2.0-flash-exp": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 1000000,
    },
    "google/gemini-2.0-flash": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 1000000,
    },
    "google/gemini-1.5-pro": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 2000000,
    },
    "google/gemini-1.5-pro-latest": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 2000000,
    },
    "google/gemini-1.5-flash": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 1000000,
    },
    "google/gemini-1.5-flash-latest": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 1000000,
    },
    "google/gemini-1.5-flash-8b": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 1000000,
    },
    "google/gemini-1.0-pro": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32000,
    },
    "google/gemini-pro": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32000,
    },
    "google/gemini-pro-vision": {
        "capabilities": ModelCapabilities(vision=True, function_calling=False, json_mode=False),
        "context_length": 16000,
    },
    
    # ==========================================================================
    # Mistral Models
    # ==========================================================================
    "mistral/mistral-large-latest": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "mistral/mistral-large-2411": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "mistral/mistral-large-2407": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "mistral/mistral-medium-latest": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32000,
    },
    "mistral/mistral-small-latest": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32000,
    },
    "mistral/pixtral-large-latest": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "mistral/pixtral-12b-2409": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "mistral/codestral-latest": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True, code_execution=True),
        "context_length": 32000,
    },
    "mistral/codestral-2405": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True, code_execution=True),
        "context_length": 32000,
    },
    "mistral/open-mixtral-8x22b": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 64000,
    },
    "mistral/open-mixtral-8x7b": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32000,
    },
    "mistral/open-mistral-7b": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 32000,
    },
    
    # ==========================================================================
    # Meta / Llama Models
    # ==========================================================================
    "meta/llama-3.3-70b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3.2-90b-vision-instruct": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3.2-11b-vision-instruct": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3.1-405b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3.1-70b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3.1-8b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "meta/llama-3-70b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 8192,
    },
    "meta/llama-3-8b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 8192,
    },
    
    # ==========================================================================
    # Cohere Models
    # ==========================================================================
    "cohere/command-r-plus": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "cohere/command-r": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "cohere/command": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 4096,
    },
    "cohere/command-light": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 4096,
    },
    
    # ==========================================================================
    # xAI / Grok Models
    # ==========================================================================
    "xai/grok-2": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 131072,
    },
    "xai/grok-2-vision": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 32768,
    },
    "xai/grok-beta": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 131072,
    },
    
    # ==========================================================================
    # Together AI Hosted Models
    # ==========================================================================
    "together/meta-llama/Llama-3.3-70B-Instruct-Turbo": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "together/meta-llama/Llama-Vision-Free": {
        "capabilities": ModelCapabilities(vision=True, function_calling=False, json_mode=False),
        "context_length": 128000,
    },
    "together/Qwen/QwQ-32B-Preview": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True),
        "context_length": 32768,
    },
    "together/deepseek-ai/DeepSeek-R1": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True),
        "context_length": 64000,
    },
    "together/deepseek-ai/DeepSeek-V3": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 64000,
    },
    
    # ==========================================================================
    # Groq Hosted Models
    # ==========================================================================
    "groq/llama-3.3-70b-versatile": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "groq/llama-3.2-90b-vision-preview": {
        "capabilities": ModelCapabilities(vision=True, function_calling=False, json_mode=False),
        "context_length": 128000,
    },
    "groq/llama-3.1-70b-versatile": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 128000,
    },
    "groq/mixtral-8x7b-32768": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 32768,
    },
    "groq/gemma2-9b-it": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 8192,
    },
    
    # ==========================================================================
    # DeepSeek Models
    # ==========================================================================
    "deepseek/deepseek-chat": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 64000,
    },
    "deepseek/deepseek-reasoner": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True),
        "context_length": 64000,
    },
    "deepseek/deepseek-coder": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True, code_execution=True),
        "context_length": 64000,
    },
    
    # ==========================================================================
    # Alibaba / Qwen Models
    # ==========================================================================
    "qwen/qwen-2.5-72b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 131072,
    },
    "qwen/qwen-2.5-32b-instruct": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 131072,
    },
    "qwen/qwen-2-vl-72b-instruct": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 32768,
    },
    "qwen/qwq-32b-preview": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=True),
        "context_length": 32768,
    },
    
    # ==========================================================================
    # Perplexity Models
    # ==========================================================================
    "perplexity/llama-3.1-sonar-huge-128k-online": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 128000,
    },
    "perplexity/llama-3.1-sonar-large-128k-online": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 128000,
    },
    "perplexity/llama-3.1-sonar-small-128k-online": {
        "capabilities": ModelCapabilities(vision=False, function_calling=False, json_mode=False),
        "context_length": 128000,
    },
    
    # ==========================================================================
    # AI21 Models
    # ==========================================================================
    "ai21/jamba-1.5-large": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 256000,
    },
    "ai21/jamba-1.5-mini": {
        "capabilities": ModelCapabilities(vision=False, function_calling=True, json_mode=True),
        "context_length": 256000,
    },
    
    # ==========================================================================
    # Amazon / AWS Bedrock Models (via Bedrock)
    # ==========================================================================
    "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "bedrock/anthropic.claude-3-opus-20240229-v1:0": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 200000,
    },
    "bedrock/amazon.nova-pro-v1:0": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 300000,
    },
    "bedrock/amazon.nova-lite-v1:0": {
        "capabilities": ModelCapabilities(vision=True, function_calling=True, json_mode=True),
        "context_length": 300000,
    },
}


def get_model_capabilities(model_id: str) -> tuple[ModelCapabilities, Optional[int]]:
    """
    Get capabilities and context length for a model.
    
    Checks static mapping first, then applies heuristics for unknown models.
    
    Args:
        model_id: Full model identifier (e.g., "openai/gpt-4o")
        
    Returns:
        Tuple of (ModelCapabilities, context_length or None)
    """
    # Normalize model ID
    model_id_lower = model_id.lower()
    
    # Check known models (exact match)
    if model_id in KNOWN_CAPABILITIES:
        entry = KNOWN_CAPABILITIES[model_id]
        return entry["capabilities"], entry.get("context_length")
    
    # Check known models (case-insensitive match)
    for known_id, entry in KNOWN_CAPABILITIES.items():
        if known_id.lower() == model_id_lower:
            return entry["capabilities"], entry.get("context_length")
    
    # Apply heuristics based on model name patterns
    caps = ModelCapabilities()
    context_length = None
    
    # Vision detection patterns
    vision_patterns = [
        "vision", "4o", "gemini-1.5", "gemini-2", "claude-3", 
        "pixtral", "llava", "grok-2", "qwen-vl", "llama-3.2-90b",
        "llama-3.2-11b", "nova-pro", "nova-lite"
    ]
    if any(p in model_id_lower for p in vision_patterns):
        caps = caps.model_copy(update={"vision": True})
    
    # Exclude vision for specific patterns
    if "o1-mini" in model_id_lower or "o1-preview" in model_id_lower:
        caps = caps.model_copy(update={"vision": False})
    
    # Function calling detection patterns
    function_patterns = [
        "gpt-4", "gpt-3.5", "claude-3", "gemini", "mistral-large",
        "mistral-small", "mistral-medium", "command-r", "llama-3.1",
        "llama-3.3", "mixtral", "qwen"
    ]
    if any(p in model_id_lower for p in function_patterns):
        caps = caps.model_copy(update={"function_calling": True})
    
    # Exclude function calling for o1 models
    if "o1" in model_id_lower and "o3" not in model_id_lower:
        caps = caps.model_copy(update={"function_calling": False})
    
    # JSON mode detection (usually same as function calling for modern models)
    if caps.function_calling:
        caps = caps.model_copy(update={"json_mode": True})
    
    # Code execution detection
    if "codestral" in model_id_lower or "deepseek-coder" in model_id_lower:
        caps = caps.model_copy(update={"code_execution": True})
    
    # Context length heuristics
    if "32k" in model_id_lower:
        context_length = 32000
    elif "16k" in model_id_lower:
        context_length = 16000
    elif "128k" in model_id_lower:
        context_length = 128000
    elif "200k" in model_id_lower:
        context_length = 200000
    elif "1m" in model_id_lower or "1000k" in model_id_lower:
        context_length = 1000000
    elif "2m" in model_id_lower or "2000k" in model_id_lower:
        context_length = 2000000
    elif "gemini-1.5-pro" in model_id_lower:
        context_length = 2000000
    elif "gemini-1.5-flash" in model_id_lower or "gemini-2" in model_id_lower:
        context_length = 1000000
    elif "claude-3" in model_id_lower:
        context_length = 200000
    elif "gpt-4o" in model_id_lower or "gpt-4-turbo" in model_id_lower:
        context_length = 128000
    elif "llama-3.1" in model_id_lower or "llama-3.2" in model_id_lower or "llama-3.3" in model_id_lower:
        context_length = 128000
    
    return caps, context_length


def enrich_model_with_capabilities(model: "ModelInfo") -> "ModelInfo":
    """
    Add capability information to a model.
    
    This function enriches a ModelInfo object with capability metadata
    based on the model ID.
    
    Args:
        model: The ModelInfo object to enrich
        
    Returns:
        The same model with capabilities and context_length populated
    """
    caps, context_length = get_model_capabilities(model.id)
    
    # Update model with capabilities
    model.capabilities = caps
    
    # Only update context_length if we have a value and model doesn't already have one
    if context_length and not model.context_length:
        model.context_length = context_length
    
    return model


def check_model_benchmark_compatibility(
    model_capabilities: ModelCapabilities,
    model_context_length: Optional[int],
    requires_vision: bool = False,
    requires_code_execution: bool = False,
    requires_function_calling: bool = False,
    min_context_length: Optional[int] = None,
) -> tuple[bool, Optional[str]]:
    """
    Check if a model meets benchmark requirements.
    
    Args:
        model_capabilities: The model's capabilities
        model_context_length: The model's context window size
        requires_vision: Whether the benchmark requires vision
        requires_code_execution: Whether the benchmark requires code execution
        requires_function_calling: Whether the benchmark requires function calling
        min_context_length: Minimum required context length
        
    Returns:
        Tuple of (is_compatible, reason_if_not)
    """
    if requires_vision and not model_capabilities.vision:
        return False, "Requires vision capability"
    
    if requires_code_execution and not model_capabilities.code_execution:
        return False, "Requires code execution"
    
    if requires_function_calling and not model_capabilities.function_calling:
        return False, "Requires function calling"
    
    if min_context_length:
        ctx = model_context_length or 4096  # Conservative default
        if ctx < min_context_length:
            return False, f"Requires {min_context_length:,}+ context (model has {ctx:,})"
    
    return True, None
