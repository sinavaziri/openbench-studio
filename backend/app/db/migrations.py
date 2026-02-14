"""
Database migration utilities.

This module provides functions to run Alembic migrations programmatically,
typically called during application startup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from app.core.config import DATABASE_PATH

logger = logging.getLogger(__name__)


def get_alembic_config() -> Config:
    """Get Alembic configuration."""
    # Find the alembic.ini file (in backend directory)
    backend_dir = Path(__file__).parent.parent.parent
    alembic_ini = backend_dir / "alembic.ini"
    
    config = Config(str(alembic_ini))
    # Override the script location to be absolute
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    # Set the database URL
    config.set_main_option("sqlalchemy.url", f"sqlite:///{DATABASE_PATH}")
    
    return config


def get_current_revision() -> Optional[str]:
    """Get the current database revision."""
    engine = create_engine(f"sqlite:///{DATABASE_PATH}")
    with engine.connect() as connection:
        context = MigrationContext.configure(connection)
        return context.get_current_revision()


def get_head_revision() -> str:
    """Get the head revision from migration scripts."""
    config = get_alembic_config()
    script = ScriptDirectory.from_config(config)
    return script.get_current_head()


def run_migrations() -> None:
    """
    Run all pending database migrations.
    
    This function is safe to call on every app startup. It will:
    - Create the database if it doesn't exist
    - Apply any pending migrations
    - Do nothing if the database is already up to date
    """
    config = get_alembic_config()
    
    # Ensure data directory exists
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    current = get_current_revision()
    head = get_head_revision()
    
    if current is None:
        # Fresh database - check if tables exist from old init_db
        engine = create_engine(f"sqlite:///{DATABASE_PATH}")
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        if tables and 'users' in tables:
            # Existing database without Alembic tracking
            # Stamp it with the current head to mark migrations as applied
            logger.info("Existing database detected, stamping with current migration head")
            command.stamp(config, "head")
        else:
            # Fresh database - run all migrations
            logger.info("Fresh database, running all migrations")
            command.upgrade(config, "head")
    elif current != head:
        # Database exists but needs migrations
        logger.info(f"Upgrading database from {current} to {head}")
        command.upgrade(config, "head")
    else:
        logger.debug("Database is up to date")


def stamp_head() -> None:
    """Mark the database as being at the current head revision without running migrations."""
    config = get_alembic_config()
    command.stamp(config, "head")


def create_migration(message: str, autogenerate: bool = True) -> None:
    """
    Create a new migration.
    
    This is typically called from the command line, not during runtime:
    
        cd backend
        alembic revision --autogenerate -m "add new column"
    
    Args:
        message: Migration description
        autogenerate: Whether to auto-detect schema changes
    """
    config = get_alembic_config()
    command.revision(config, message=message, autogenerate=autogenerate)
