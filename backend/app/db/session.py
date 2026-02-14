"""
Database session management.

This module provides async database connection management using aiosqlite.
Database schema is managed by Alembic migrations (see migrations.py).
"""

import aiosqlite
from contextlib import asynccontextmanager
from app.core.config import DATABASE_PATH


@asynccontextmanager
async def get_db():
    """
    Get an async database connection.
    
    Usage:
        async with get_db() as db:
            await db.execute("SELECT * FROM users")
            rows = await db.fetchall()
    """
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db
