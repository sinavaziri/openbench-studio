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

class ApiKeyProvider(str, Enum):
    """Supported API key providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    MISTRAL = "mistral"
    COHERE = "cohere"
    TOGETHER = "together"
    GROQ = "groq"
    FIREWORKS = "fireworks"
    OPENROUTER = "openrouter"
    CUSTOM = "custom"


# Map providers to environment variable names
PROVIDER_ENV_VARS = {
    ApiKeyProvider.OPENAI: "OPENAI_API_KEY",
    ApiKeyProvider.ANTHROPIC: "ANTHROPIC_API_KEY",
    ApiKeyProvider.GOOGLE: "GOOGLE_API_KEY",
    ApiKeyProvider.MISTRAL: "MISTRAL_API_KEY",
    ApiKeyProvider.COHERE: "COHERE_API_KEY",
    ApiKeyProvider.TOGETHER: "TOGETHER_API_KEY",
    ApiKeyProvider.GROQ: "GROQ_API_KEY",
    ApiKeyProvider.FIREWORKS: "FIREWORKS_API_KEY",
    ApiKeyProvider.OPENROUTER: "OPENROUTER_API_KEY",
}


class ApiKey(BaseModel):
    """An API key for a provider."""
    key_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    provider: ApiKeyProvider
    encrypted_key: str  # AES encrypted
    key_preview: str  # Last 4 characters for display
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApiKeyCreate(BaseModel):
    """Request body for creating an API key."""
    provider: ApiKeyProvider
    key: str = Field(min_length=1)


class ApiKeyPublic(BaseModel):
    """Public API key info (no actual key)."""
    key_id: str
    provider: ApiKeyProvider
    key_preview: str
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

