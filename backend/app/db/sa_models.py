"""
SQLAlchemy ORM models for database schema.

These models define the actual database schema and are used by Alembic
for migrations. The Pydantic models in models.py are used for API
validation and serialization.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class User(Base):
    """A user account."""
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(String, nullable=False)  # ISO format string
    is_active = Column(Integer, nullable=False, default=1)

    # Relationships
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="user")
    templates = relationship("RunTemplate", back_populates="user", cascade="all, delete-orphan")


class ApiKey(Base):
    """An API key for a provider."""
    __tablename__ = "api_keys"

    key_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    encrypted_key = Column(String, nullable=False)
    key_preview = Column(String, nullable=False)
    custom_env_var = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Constraints
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uix_user_provider"),
    )

    # Relationships
    user = relationship("User", back_populates="api_keys")


class Run(Base):
    """A benchmark run."""
    __tablename__ = "runs"

    run_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=True, index=True)
    benchmark = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="queued", index=True)
    created_at = Column(String, nullable=False)
    started_at = Column(String, nullable=True)
    finished_at = Column(String, nullable=True)
    scheduled_for = Column(String, nullable=True, index=True)  # ISO format datetime for scheduled runs
    artifact_dir = Column(String, nullable=True)
    exit_code = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    config_json = Column(Text, nullable=True)
    primary_metric = Column(Float, nullable=True)
    primary_metric_name = Column(String, nullable=True)
    tags_json = Column(Text, nullable=True, default="[]")
    notes = Column(Text, nullable=True)  # User notes for the run
    template_id = Column(String, ForeignKey("run_templates.template_id"), nullable=True, index=True)
    template_name = Column(String, nullable=True)  # Denormalized for display even if template deleted
    
    # Cost tracking fields
    input_tokens = Column(Integer, nullable=True)  # Number of input/prompt tokens
    output_tokens = Column(Integer, nullable=True)  # Number of output/completion tokens
    total_tokens = Column(Integer, nullable=True)  # Total tokens used
    estimated_cost = Column(Float, nullable=True)  # Estimated cost in USD

    # Relationships
    user = relationship("User", back_populates="runs")
    template = relationship("RunTemplate", back_populates="runs")


class RunTemplate(Base):
    """A saved benchmark run configuration template."""
    __tablename__ = "run_templates"

    template_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    benchmark = Column(String, nullable=False)
    model = Column(String, nullable=False)
    config_json = Column(Text, nullable=True)  # Full RunConfig as JSON
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    user = relationship("User", back_populates="templates")
    runs = relationship("Run", back_populates="template")
