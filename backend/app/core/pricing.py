"""
Model pricing configuration for cost estimation.

Prices are in USD per 1M tokens. This file can be extended
to load from environment variables or a config file.
"""

from typing import Optional

# Pricing in USD per 1M tokens (input, output)
# Last updated: February 2024
MODEL_PRICING: dict[str, dict[str, float]] = {
    # OpenAI
    "openai/gpt-4o": {"input": 5.00, "output": 15.00},
    "openai/gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "openai/gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "openai/gpt-4": {"input": 30.00, "output": 60.00},
    "openai/gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "openai/o1": {"input": 15.00, "output": 60.00},
    "openai/o1-mini": {"input": 3.00, "output": 12.00},
    "openai/o1-preview": {"input": 15.00, "output": 60.00},
    
    # Anthropic
    "anthropic/claude-3-opus": {"input": 15.00, "output": 75.00},
    "anthropic/claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-haiku": {"input": 0.25, "output": 1.25},
    "anthropic/claude-3-5-haiku": {"input": 1.00, "output": 5.00},
    "anthropic/claude-opus-4": {"input": 15.00, "output": 75.00},
    
    # Google
    "google/gemini-pro": {"input": 0.125, "output": 0.375},
    "google/gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "google/gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "google/gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    
    # Groq (free tier has generous limits)
    "groq/llama-3.1-70b": {"input": 0.59, "output": 0.79},
    "groq/llama-3.1-8b": {"input": 0.05, "output": 0.08},
    "groq/llama-3.3-70b": {"input": 0.59, "output": 0.79},
    "groq/mixtral-8x7b": {"input": 0.24, "output": 0.24},
    "groq/gemma2-9b-it": {"input": 0.20, "output": 0.20},
    
    # Mistral
    "mistral/mistral-large": {"input": 2.00, "output": 6.00},
    "mistral/mistral-medium": {"input": 2.70, "output": 8.10},
    "mistral/mistral-small": {"input": 0.20, "output": 0.60},
    "mistral/codestral": {"input": 0.20, "output": 0.60},
    
    # Together
    "together/llama-3.1-70b": {"input": 0.88, "output": 0.88},
    "together/llama-3.1-8b": {"input": 0.18, "output": 0.18},
    "together/mixtral-8x7b": {"input": 0.60, "output": 0.60},
    
    # Fireworks
    "fireworks/llama-v3p1-70b-instruct": {"input": 0.90, "output": 0.90},
    "fireworks/llama-v3p1-8b-instruct": {"input": 0.20, "output": 0.20},
    
    # DeepInfra
    "deepinfra/llama-3.1-70b": {"input": 0.35, "output": 0.40},
    "deepinfra/llama-3.1-8b": {"input": 0.06, "output": 0.06},
    
    # Perplexity (includes search)
    "perplexity/llama-3.1-sonar-huge-128k-online": {"input": 5.00, "output": 5.00},
    "perplexity/llama-3.1-sonar-large-128k-online": {"input": 1.00, "output": 1.00},
    "perplexity/llama-3.1-sonar-small-128k-online": {"input": 0.20, "output": 0.20},
}

# Default pricing for unknown models (conservative estimate)
DEFAULT_PRICING = {"input": 1.00, "output": 3.00}


def get_model_pricing(model: str) -> dict[str, float]:
    """
    Get pricing for a model.
    
    Args:
        model: Model identifier (e.g., 'openai/gpt-4o')
        
    Returns:
        Dict with 'input' and 'output' prices per 1M tokens
    """
    # Try exact match first
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    
    # Try matching by model name (without version suffix)
    model_base = model.rsplit("-", 1)[0] if "-" in model else model
    if model_base in MODEL_PRICING:
        return MODEL_PRICING[model_base]
    
    # Try matching by provider/model pattern
    if "/" in model:
        provider, model_name = model.split("/", 1)
        # Check for partial matches in the same provider
        for key, pricing in MODEL_PRICING.items():
            if key.startswith(f"{provider}/"):
                key_model = key.split("/", 1)[1]
                if model_name.startswith(key_model.split("-")[0]):
                    return pricing
    
    return DEFAULT_PRICING


def estimate_cost(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: Optional[int] = None,
) -> float:
    """
    Estimate the cost for a model run.
    
    Args:
        model: Model identifier
        input_tokens: Number of input/prompt tokens
        output_tokens: Number of output/completion tokens
        total_tokens: If provided and input/output not available,
                     assumes 30% input, 70% output split
        
    Returns:
        Estimated cost in USD
    """
    if total_tokens and not (input_tokens or output_tokens):
        # Assume typical split: 30% input, 70% output
        input_tokens = int(total_tokens * 0.3)
        output_tokens = int(total_tokens * 0.7)
    
    pricing = get_model_pricing(model)
    
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    
    return round(input_cost + output_cost, 6)


def get_all_pricing() -> dict[str, dict[str, float]]:
    """Get all model pricing data."""
    return MODEL_PRICING.copy()
