from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr
import uuid


# =============================================================================
# User Models
# =============================================================================

class User(BaseModel):
    """A user account."""
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True


class UserCreate(BaseModel):
    """Request body for creating a user."""
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    """Request body for logging in."""
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    """Public user info (no password)."""
    user_id: str
    email: str
    created_at: datetime
    is_active: bool


class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Data encoded in the JWT."""
    user_id: str
    email: str


# =============================================================================
# API Key Models
# =============================================================================

# Provider ID type (string for dynamic providers)
ApiKeyProvider = str

# Comprehensive list of pre-defined providers from openbench.dev
PREDEFINED_PROVIDERS = {
    "ai21": {"display_name": "AI21 Labs", "env_var": "AI21_API_KEY", "color": "#6b7280"},
    "anthropic": {"display_name": "Anthropic", "env_var": "ANTHROPIC_API_KEY", "color": "#d97706"},
    "bedrock": {"display_name": "AWS Bedrock", "env_var": "AWS_ACCESS_KEY_ID", "color": "#ff9900"},
    "azure": {"display_name": "Azure OpenAI", "env_var": "AZURE_OPENAI_API_KEY", "color": "#0078d4"},
    "baseten": {"display_name": "Baseten", "env_var": "BASETEN_API_KEY", "color": "#6b7280"},
    "cerebras": {"display_name": "Cerebras", "env_var": "CEREBRAS_API_KEY", "color": "#6366f1"},
    "cohere": {"display_name": "Cohere", "env_var": "COHERE_API_KEY", "color": "#7c3aed"},
    "crusoe": {"display_name": "Crusoe", "env_var": "CRUSOE_API_KEY", "color": "#6b7280"},
    "deepinfra": {"display_name": "DeepInfra", "env_var": "DEEPINFRA_API_KEY", "color": "#6b7280"},
    "friendli": {"display_name": "Friendli", "env_var": "FRIENDLI_TOKEN", "color": "#6b7280"},
    "google": {"display_name": "Google AI", "env_var": "GOOGLE_API_KEY", "color": "#4285f4"},
    "groq": {"display_name": "Groq", "env_var": "GROQ_API_KEY", "color": "#f97316"},
    "huggingface": {"display_name": "Hugging Face", "env_var": "HF_TOKEN", "color": "#fbbf24"},
    "hyperbolic": {"display_name": "Hyperbolic", "env_var": "HYPERBOLIC_API_KEY", "color": "#6b7280"},
    "lambda": {"display_name": "Lambda", "env_var": "LAMBDA_API_KEY", "color": "#6b7280"},
    "minimax": {"display_name": "MiniMax", "env_var": "MINIMAX_API_KEY", "color": "#6b7280"},
    "mistral": {"display_name": "Mistral", "env_var": "MISTRAL_API_KEY", "color": "#ff7000"},
    "moonshot": {"display_name": "Moonshot", "env_var": "MOONSHOT_API_KEY", "color": "#6b7280"},
    "nebius": {"display_name": "Nebius", "env_var": "NEBIUS_API_KEY", "color": "#6b7280"},
    "nous": {"display_name": "Nous Research", "env_var": "NOUS_API_KEY", "color": "#6b7280"},
    "novita": {"display_name": "Novita AI", "env_var": "NOVITA_API_KEY", "color": "#6b7280"},
    "ollama": {"display_name": "Ollama", "env_var": "OLLAMA_HOST", "color": "#6b7280"},
    "openai": {"display_name": "OpenAI", "env_var": "OPENAI_API_KEY", "color": "#10a37f"},
    "openrouter": {"display_name": "OpenRouter", "env_var": "OPENROUTER_API_KEY", "color": "#6366f1"},
    "parasail": {"display_name": "Parasail", "env_var": "PARASAIL_API_KEY", "color": "#6b7280"},
    "perplexity": {"display_name": "Perplexity", "env_var": "PERPLEXITY_API_KEY", "color": "#6b7280"},
    "reka": {"display_name": "Reka", "env_var": "REKA_API_KEY", "color": "#6b7280"},
    "sambanova": {"display_name": "SambaNova", "env_var": "SAMBANOVA_API_KEY", "color": "#6b7280"},
    "siliconflow": {"display_name": "SiliconFlow", "env_var": "SILICONFLOW_API_KEY", "color": "#6b7280"},
    "together": {"display_name": "Together AI", "env_var": "TOGETHER_API_KEY", "color": "#3b82f6"},
    "vercel": {"display_name": "Vercel AI Gateway", "env_var": "AI_GATEWAY_API_KEY", "color": "#000000"},
    "wandb": {"display_name": "W&B Inference", "env_var": "WANDB_API_KEY", "color": "#fbbf24"},
    "vllm": {"display_name": "vLLM", "env_var": "VLLM_API_KEY", "color": "#6b7280"},
    "fireworks": {"display_name": "Fireworks", "env_var": "FIREWORKS_API_KEY", "color": "#ef4444"},
}


def get_env_var_for_provider(provider: str, custom_env_var: Optional[str] = None) -> str:
    """
    Get the environment variable name for a provider.
    
    Args:
        provider: The provider ID (e.g., 'openai', 'anthropic')
        custom_env_var: Optional custom environment variable name
        
    Returns:
        The environment variable name to use
    """
    if custom_env_var:
        return custom_env_var
    
    if provider in PREDEFINED_PROVIDERS:
        return PREDEFINED_PROVIDERS[provider]["env_var"]
    
    # For custom providers, generate env var name from provider ID
    return f"{provider.upper().replace('-', '_').replace(' ', '_')}_API_KEY"


class ApiKey(BaseModel):
    """An API key for a provider."""
    key_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    provider: str  # Dynamic provider ID
    encrypted_key: str  # AES encrypted
    key_preview: str  # Last 4 characters for display
    custom_env_var: Optional[str] = None  # Optional custom env var name
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApiKeyCreate(BaseModel):
    """Request body for creating an API key."""
    provider: str = Field(min_length=1, max_length=100)
    key: str = Field(min_length=1)
    custom_env_var: Optional[str] = Field(None, max_length=100)


class ApiKeyPublic(BaseModel):
    """Public API key info (no actual key)."""
    key_id: str
    provider: str
    key_preview: str
    custom_env_var: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Run Models
# =============================================================================

class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class RunConfig(BaseModel):
    """Configuration for a benchmark run."""
    schema_version: int = 1  # Config schema version for reproducibility
    benchmark: str
    model: str
    limit: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: Optional[int] = None
    epochs: Optional[int] = None
    max_connections: Optional[int] = None


class Run(BaseModel):
    """A benchmark run."""
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None  # Owner of the run (null for legacy runs)
    benchmark: str
    model: str
    status: RunStatus = RunStatus.QUEUED
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    artifact_dir: Optional[str] = None
    exit_code: Optional[int] = None
    error: Optional[str] = None
    config: Optional[RunConfig] = None
    primary_metric: Optional[float] = None
    primary_metric_name: Optional[str] = None
    tags: list[str] = Field(default_factory=list)  # User-defined tags for organization


class RunCreate(BaseModel):
    """Request body for creating a run."""
    benchmark: str
    model: str
    limit: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: Optional[int] = None
    epochs: Optional[int] = None
    max_connections: Optional[int] = None


class RunSummary(BaseModel):
    """Summary of a run for list views."""
    run_id: str
    benchmark: str
    model: str
    status: RunStatus
    created_at: datetime
    finished_at: Optional[datetime] = None
    primary_metric: Optional[float] = None
    primary_metric_name: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class RunTagsUpdate(BaseModel):
    """Request body for updating run tags."""
    tags: list[str]


# =============================================================================
# Benchmark Models
# =============================================================================

class Benchmark(BaseModel):
    """A benchmark definition."""
    name: str
    category: str
    description_short: str
    description: Optional[str] = None  # Full description for detail view
    tags: list[str] = Field(default_factory=list)
    featured: bool = False  # Whether this is a featured/popular benchmark

