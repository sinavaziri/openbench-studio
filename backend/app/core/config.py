"""
Centralized configuration management using Pydantic Settings.

All application configuration is loaded from environment variables with
sensible defaults where appropriate. Required variables will fail fast
with clear error messages on startup.
"""

import secrets
import sys
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# =============================================================================
# Path Configuration (computed early for Docker vs local detection)
# =============================================================================

def _detect_data_dir() -> Path:
    """Detect data directory based on environment (Docker vs local)."""
    if Path("/app/data").exists():
        # Running in Docker container
        return Path("/app/data")
    else:
        # Running locally - relative to project root
        return Path(__file__).parent.parent.parent.parent / "data"


# =============================================================================
# Settings Classes
# =============================================================================

class DatabaseSettings(BaseSettings):
    """Database configuration."""
    
    model_config = SettingsConfigDict(
        env_prefix="OPENBENCH_DB_",
        extra="ignore",
    )
    
    # Connection settings
    path: Optional[Path] = Field(
        default=None,
        description="Path to SQLite database file. Defaults to DATA_DIR/openbench.db",
    )
    
    # Connection pool settings (for future use with async engines)
    pool_size: int = Field(
        default=5,
        ge=1,
        le=50,
        description="Database connection pool size",
    )
    
    echo: bool = Field(
        default=False,
        description="Echo SQL queries (for debugging)",
    )


class AuthSettings(BaseSettings):
    """Authentication and security configuration."""
    
    model_config = SettingsConfigDict(
        env_prefix="OPENBENCH_",
        extra="ignore",
    )
    
    secret_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        description="Secret key for JWT signing. MUST be set in production!",
        alias="OPENBENCH_SECRET_KEY",
    )
    
    encryption_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32)[:32],
        description="Encryption key for API key storage (32 bytes). MUST be set in production!",
        alias="OPENBENCH_ENCRYPTION_KEY",
    )
    
    algorithm: str = Field(
        default="HS256",
        description="JWT signing algorithm",
    )
    
    access_token_expire_minutes: int = Field(
        default=60 * 24 * 7,  # 7 days
        ge=1,
        description="Access token expiration time in minutes",
    )
    
    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "OPENBENCH_SECRET_KEY must be at least 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        return v
    
    @field_validator("encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "OPENBENCH_ENCRYPTION_KEY must be at least 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32)[:32])\""
            )
        return v[:32]  # Ensure exactly 32 chars


class ApiSettings(BaseSettings):
    """API configuration."""
    
    model_config = SettingsConfigDict(
        env_prefix="OPENBENCH_API_",
        extra="ignore",
    )
    
    prefix: str = Field(
        default="/api",
        description="API route prefix",
    )
    
    cors_origins: list[str] = Field(
        default=[
            # Local development (Vite)
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:5177",
            "http://localhost:5178",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://127.0.0.1:5175",
            "http://127.0.0.1:5176",
            "http://127.0.0.1:5177",
            "http://127.0.0.1:5178",
            # Docker (nginx proxy)
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        description="Allowed CORS origins (comma-separated in env var)",
    )
    
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


class ServerSettings(BaseSettings):
    """Server/Uvicorn configuration."""
    
    model_config = SettingsConfigDict(
        env_prefix="OPENBENCH_",
        extra="ignore",
    )
    
    host: str = Field(
        default="0.0.0.0",
        description="Server bind host",
        alias="OPENBENCH_HOST",
    )
    
    port: int = Field(
        default=8000,
        ge=1,
        le=65535,
        description="Server bind port",
        alias="OPENBENCH_PORT",
    )
    
    debug: bool = Field(
        default=False,
        description="Enable debug mode",
        alias="OPENBENCH_DEBUG",
    )
    
    log_level: str = Field(
        default="info",
        description="Logging level (debug, info, warning, error)",
        alias="OPENBENCH_LOG_LEVEL",
    )
    
    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid = {"debug", "info", "warning", "error", "critical"}
        if v.lower() not in valid:
            raise ValueError(f"log_level must be one of: {', '.join(valid)}")
        return v.lower()


class Settings(BaseSettings):
    """
    Main application settings.
    
    All configuration is loaded from environment variables with the OPENBENCH_ prefix.
    Required variables (SECRET_KEY, ENCRYPTION_KEY) must be set in production.
    """
    
    model_config = SettingsConfigDict(
        env_prefix="OPENBENCH_",
        env_nested_delimiter="__",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Environment identification
    environment: str = Field(
        default="development",
        description="Environment name (development, staging, production)",
        alias="OPENBENCH_ENV",
    )
    
    # Config version for reproducibility
    config_schema_version: int = Field(
        default=1,
        description="Configuration schema version",
    )
    
    # Nested settings
    db: DatabaseSettings = Field(default_factory=DatabaseSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    api: ApiSettings = Field(default_factory=ApiSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    
    # Computed paths (set via default_factory to handle Docker vs local)
    data_dir: Path = Field(default_factory=_detect_data_dir)
    runs_dir: Optional[Path] = Field(default=None)
    
    @model_validator(mode="after")
    def setup_paths(self) -> "Settings":
        """Set up data and runs directories."""
        # Set up runs directory if not explicitly set
        if self.runs_dir is None:
            object.__setattr__(self, "runs_dir", self.data_dir / "runs")
        
        # Set database path if not explicitly configured
        if self.db.path is None:
            self.db.path = self.data_dir / "openbench.db"
        
        # Ensure directories exist
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        
        return self
    
    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Warn about insecure settings in production."""
        if self.environment.lower() == "production":
            # Check if using default generated secrets (they start with specific patterns)
            # This is a heuristic - in production, secrets should be explicitly set
            if self.server.debug:
                print(
                    "WARNING: Debug mode is enabled in production! "
                    "Set OPENBENCH_DEBUG=false",
                    file=sys.stderr,
                )
        return self


# =============================================================================
# Settings Instance & Backward Compatibility
# =============================================================================

@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Settings are loaded once and cached for the lifetime of the application.
    """
    return Settings()


# Create the global settings instance
_settings = get_settings()

# =============================================================================
# Backward-compatible exports (for existing code)
# =============================================================================

# Base directories
DATA_DIR = _settings.data_dir
RUNS_DIR = _settings.runs_dir

# Database
DATABASE_PATH = _settings.db.path

# API settings
API_PREFIX = _settings.api.prefix

# Config version
CONFIG_SCHEMA_VERSION = _settings.config_schema_version

# Auth settings
SECRET_KEY = _settings.auth.secret_key
ALGORITHM = _settings.auth.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = _settings.auth.access_token_expire_minutes

# Encryption
ENCRYPTION_KEY = _settings.auth.encryption_key


# =============================================================================
# Settings access function (for dependency injection)
# =============================================================================

def get_current_settings() -> Settings:
    """
    Get the current settings instance.
    
    Use this in FastAPI dependencies:
    
        @app.get("/config")
        async def get_config(settings: Settings = Depends(get_current_settings)):
            return {"env": settings.environment}
    """
    return _settings
