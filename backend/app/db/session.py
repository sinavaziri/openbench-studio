import aiosqlite
from contextlib import asynccontextmanager
from app.core.config import DATABASE_PATH


async def init_db():
    """Initialize the database with required tables."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Users table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )
        """)
        
        # API keys table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                key_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                encrypted_key TEXT NOT NULL,
                key_preview TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                UNIQUE(user_id, provider)
            )
        """)
        
        # Runs table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                user_id TEXT,
                benchmark TEXT NOT NULL,
                model TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                artifact_dir TEXT,
                exit_code INTEGER,
                error TEXT,
                config_json TEXT,
                primary_metric REAL,
                primary_metric_name TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        await db.commit()
        
        # Migrations for existing DBs
        migrations = [
            "ALTER TABLE runs ADD COLUMN primary_metric REAL",
            "ALTER TABLE runs ADD COLUMN primary_metric_name TEXT",
            "ALTER TABLE runs ADD COLUMN user_id TEXT",
            "ALTER TABLE runs ADD COLUMN tags_json TEXT DEFAULT '[]'",
        ]
        
        for migration in migrations:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception:
                pass  # Column already exists


@asynccontextmanager
async def get_db():
    """Get a database connection."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

