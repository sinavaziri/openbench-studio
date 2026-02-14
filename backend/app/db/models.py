from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict
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
    """Request body for creating a user account."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "securepassword123"
            }
        }
    )
    
    email: EmailStr = Field(
        description="User's email address (must be unique)",
        examples=["user@example.com"]
    )
    password: str = Field(
        min_length=8,
        description="Password (minimum 8 characters)",
        examples=["securepassword123"]
    )


class UserLogin(BaseModel):
    """Request body for logging in."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "securepassword123"
            }
        }
    )
    
    email: EmailStr = Field(
        description="Registered email address",
        examples=["user@example.com"]
    )
    password: str = Field(
        description="Account password",
        examples=["securepassword123"]
    )


class UserPublic(BaseModel):
    """Public user profile (excludes sensitive data)."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "email": "user@example.com",
                "created_at": "2024-01-15T10:30:00Z",
                "is_active": True
            }
        }
    )
    
    user_id: str = Field(description="Unique user identifier (UUID)")
    email: str = Field(description="User's email address")
    created_at: datetime = Field(description="Account creation timestamp")
    is_active: bool = Field(description="Whether the account is active")


class Token(BaseModel):
    """JWT token response for authentication."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer"
            }
        }
    )
    
    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type (always 'bearer')")


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
    """An API key for a provider (internal model)."""
    key_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    provider: str  # Dynamic provider ID
    encrypted_key: str  # AES encrypted
    key_preview: str  # Last 4 characters for display
    custom_env_var: Optional[str] = None  # Optional custom env var name
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApiKeyCreate(BaseModel):
    """Request body for creating or updating an API key."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "provider": "openai",
                "key": "sk-proj-abc123...",
                "custom_env_var": None
            }
        }
    )
    
    provider: str = Field(
        min_length=1,
        max_length=100,
        description="Provider ID (e.g., 'openai', 'anthropic')",
        examples=["openai", "anthropic", "google"]
    )
    key: str = Field(
        min_length=1,
        description="The API key value (will be encrypted at rest)",
        examples=["sk-proj-abc123..."]
    )
    custom_env_var: Optional[str] = Field(
        None,
        max_length=100,
        description="Optional custom environment variable name",
        examples=["MY_CUSTOM_OPENAI_KEY"]
    )


class ApiKeyPublic(BaseModel):
    """Public API key info (excludes the actual key value)."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "key_id": "550e8400-e29b-41d4-a716-446655440000",
                "provider": "openai",
                "key_preview": "...abc123",
                "custom_env_var": None,
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-15T10:30:00Z"
            }
        }
    )
    
    key_id: str = Field(description="Unique key identifier")
    provider: str = Field(description="Provider ID")
    key_preview: str = Field(description="Last 4 characters of the key for identification")
    custom_env_var: Optional[str] = Field(None, description="Custom environment variable name if set")
    created_at: datetime = Field(description="When the key was first added")
    updated_at: datetime = Field(description="When the key was last updated")


# =============================================================================
# Run Models
# =============================================================================

class RunStatus(str, Enum):
    """Status of a benchmark run."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class RunConfig(BaseModel):
    """Configuration for a benchmark run (used for reproducibility)."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "schema_version": 1,
                "benchmark": "mmlu",
                "model": "openai/gpt-4o",
                "limit": 100,
                "temperature": 0.0,
                "epochs": 1
            }
        }
    )
    
    schema_version: int = Field(default=1, description="Config schema version for compatibility")
    benchmark: str = Field(description="Benchmark name/identifier")
    model: str = Field(description="Model identifier (e.g., 'openai/gpt-4o')")
    limit: Optional[int] = Field(None, description="Maximum number of samples to evaluate")
    temperature: Optional[float] = Field(None, ge=0, le=2, description="Sampling temperature (0-2)")
    top_p: Optional[float] = Field(None, ge=0, le=1, description="Nucleus sampling probability")
    max_tokens: Optional[int] = Field(None, ge=1, description="Maximum tokens in response")
    timeout: Optional[int] = Field(None, ge=1, description="Request timeout in seconds")
    epochs: Optional[int] = Field(None, ge=1, description="Number of evaluation epochs")
    max_connections: Optional[int] = Field(None, ge=1, description="Maximum concurrent API connections")


class Run(BaseModel):
    """A benchmark run."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "run_id": "550e8400-e29b-41d4-a716-446655440000",
                "user_id": "660e8400-e29b-41d4-a716-446655440001",
                "benchmark": "mmlu",
                "model": "openai/gpt-4o",
                "status": "completed",
                "created_at": "2024-01-15T10:30:00Z",
                "started_at": "2024-01-15T10:30:05Z",
                "finished_at": "2024-01-15T10:45:00Z",
                "exit_code": 0,
                "primary_metric": 0.85,
                "primary_metric_name": "accuracy",
                "tags": ["gpt-4", "baseline"]
            }
        }
    )
    
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique run identifier")
    user_id: Optional[str] = Field(None, description="Owner's user ID")
    benchmark: str = Field(description="Benchmark name")
    model: str = Field(description="Model identifier")
    status: RunStatus = Field(default=RunStatus.QUEUED, description="Current run status")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When the run was created")
    started_at: Optional[datetime] = Field(None, description="When execution started")
    finished_at: Optional[datetime] = Field(None, description="When execution finished")
    artifact_dir: Optional[str] = Field(None, description="Path to run artifacts")
    exit_code: Optional[int] = Field(None, description="Process exit code")
    error: Optional[str] = Field(None, description="Error message if failed")
    config: Optional[RunConfig] = Field(None, description="Full run configuration")
    primary_metric: Optional[float] = Field(None, description="Primary metric value (e.g., accuracy)")
    primary_metric_name: Optional[str] = Field(None, description="Name of the primary metric")
    tags: list[str] = Field(default_factory=list, description="User-defined tags")
    notes: Optional[str] = Field(None, description="User notes for the run")


class RunCreate(BaseModel):
    """Request body for creating a new benchmark run."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "benchmark": "mmlu",
                "model": "openai/gpt-4o",
                "limit": 100,
                "temperature": 0.0
            }
        }
    )
    
    benchmark: str = Field(
        description="Name of the benchmark to run",
        examples=["mmlu", "gsm8k", "humaneval"]
    )
    model: str = Field(
        description="Model identifier in provider/model format",
        examples=["openai/gpt-4o", "anthropic/claude-3-5-sonnet", "google/gemini-pro"]
    )
    limit: Optional[int] = Field(
        None,
        ge=1,
        description="Limit number of samples (useful for testing)",
        examples=[10, 100, 1000]
    )
    temperature: Optional[float] = Field(
        None,
        ge=0,
        le=2,
        description="Sampling temperature (0=deterministic)",
        examples=[0.0, 0.7, 1.0]
    )
    top_p: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Nucleus sampling probability",
        examples=[0.9, 0.95, 1.0]
    )
    max_tokens: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum tokens in model response",
        examples=[256, 1024, 4096]
    )
    timeout: Optional[int] = Field(
        None,
        ge=1,
        description="Request timeout in seconds",
        examples=[30, 60, 120]
    )
    epochs: Optional[int] = Field(
        None,
        ge=1,
        description="Number of evaluation epochs",
        examples=[1, 3, 5]
    )
    max_connections: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum concurrent API connections",
        examples=[1, 5, 10]
    )


class RunSummary(BaseModel):
    """Summary of a run for list views."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "run_id": "550e8400-e29b-41d4-a716-446655440000",
                "benchmark": "mmlu",
                "model": "openai/gpt-4o",
                "status": "completed",
                "created_at": "2024-01-15T10:30:00Z",
                "finished_at": "2024-01-15T10:45:00Z",
                "primary_metric": 0.85,
                "primary_metric_name": "accuracy",
                "tags": ["baseline"]
            }
        }
    )
    
    run_id: str = Field(description="Unique run identifier")
    benchmark: str = Field(description="Benchmark name")
    model: str = Field(description="Model identifier")
    status: RunStatus = Field(description="Current run status")
    created_at: datetime = Field(description="When the run was created")
    finished_at: Optional[datetime] = Field(None, description="When execution finished")
    primary_metric: Optional[float] = Field(None, description="Primary metric value")
    primary_metric_name: Optional[str] = Field(None, description="Name of the primary metric")
    tags: list[str] = Field(default_factory=list, description="User-defined tags")
    notes: Optional[str] = Field(None, description="User notes for the run")


class RunTagsUpdate(BaseModel):
    """Request body for updating run tags."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tags": ["baseline", "production", "v2"]
            }
        }
    )
    
    tags: list[str] = Field(
        description="New list of tags (replaces existing tags)",
        examples=[["baseline", "production"]]
    )


class RunNotesUpdate(BaseModel):
    """Request body for updating run notes."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "notes": "This run used the updated prompt template with few-shot examples."
            }
        }
    )
    
    notes: Optional[str] = Field(
        None,
        description="Notes about this run (can be None to clear)",
        examples=["Good baseline run", "Testing new prompt format"]
    )


# =============================================================================
# Benchmark Models
# =============================================================================

class Benchmark(BaseModel):
    """A benchmark definition."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "mmlu",
                "category": "Knowledge",
                "description_short": "Massive Multitask Language Understanding",
                "description": "MMLU tests models on 57 subjects across STEM, humanities, social sciences, and more.",
                "tags": ["knowledge", "multiple-choice", "academic"],
                "featured": True,
                "source": "builtin"
            }
        }
    )
    
    name: str = Field(description="Benchmark identifier")
    category: str = Field(description="Category (e.g., 'Knowledge', 'Coding', 'Math')")
    description_short: str = Field(description="Brief one-line description")
    description: Optional[str] = Field(None, description="Full detailed description")
    tags: list[str] = Field(default_factory=list, description="Categorization tags")
    featured: bool = Field(default=False, description="Whether this is a featured benchmark")
    source: Optional[str] = Field(None, description="Source: 'builtin', 'plugin', 'github', etc.")


# =============================================================================
# API Response Models (for documentation)
# =============================================================================

class MessageResponse(BaseModel):
    """Simple status message response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"status": "ok"}
        }
    )
    
    status: str = Field(description="Status message")


class RunCreatedResponse(BaseModel):
    """Response when a run is created."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"run_id": "550e8400-e29b-41d4-a716-446655440000"}
        }
    )
    
    run_id: str = Field(description="ID of the created run")


class TagsResponse(BaseModel):
    """Response containing tags."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"tags": ["baseline", "production"]}
        }
    )
    
    tags: list[str] = Field(description="List of tags")


class BulkDeleteResponse(BaseModel):
    """Response for bulk delete operations."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "completed",
                "summary": {
                    "total": 5,
                    "deleted": 3,
                    "failed": 0,
                    "running": 1,
                    "not_found": 1
                },
                "details": {
                    "deleted": ["id1", "id2", "id3"],
                    "failed": [],
                    "running": ["id4"],
                    "not_found": ["id5"]
                }
            }
        }
    )
    
    status: str = Field(description="Overall operation status")
    summary: dict = Field(description="Summary counts")
    details: dict = Field(description="Lists of run IDs by result")


class VersionResponse(BaseModel):
    """Version information response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "web_ui": "1.0.0",
                "openbench": "0.5.3",
                "openbench_available": True
            }
        }
    )
    
    web_ui: str = Field(description="Web UI version")
    openbench: Optional[str] = Field(None, description="OpenBench CLI version")
    openbench_available: bool = Field(description="Whether OpenBench CLI is installed")


class HealthResponse(BaseModel):
    """Health check response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"status": "ok"}
        }
    )
    
    status: str = Field(description="Health status")


class ProviderInfo(BaseModel):
    """Information about an API key provider."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "provider": "openai",
                "env_var": "OPENAI_API_KEY",
                "display_name": "OpenAI",
                "color": "#10a37f"
            }
        }
    )
    
    provider: str = Field(description="Provider ID")
    env_var: str = Field(description="Environment variable name")
    display_name: str = Field(description="Human-readable name")
    color: str = Field(description="Brand color (hex)")
