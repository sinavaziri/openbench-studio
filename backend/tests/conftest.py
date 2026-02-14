"""
Pytest configuration and fixtures for OpenBench Studio tests.

All fixtures are designed to work without external dependencies for CI.
"""

import asyncio
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Generator
from unittest.mock import patch

import pytest
import pytest_asyncio
import aiosqlite

# Set test environment variables BEFORE importing app modules
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32chars"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Provide a temporary directory for test artifacts."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_db_path(temp_dir: Path) -> Path:
    """Provide a path for a temporary test database."""
    return temp_dir / "test_openbench.db"


async def _init_test_db(db_path: Path):
    """Initialize a test database with required tables."""
    async with aiosqlite.connect(db_path) as db:
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
        
        # API keys table (with custom_env_var column)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                key_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                encrypted_key TEXT NOT NULL,
                key_preview TEXT NOT NULL,
                custom_env_var TEXT,
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
                tags_json TEXT DEFAULT '[]',
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        await db.commit()


@pytest_asyncio.fixture
async def test_db(temp_db_path: Path, monkeypatch) -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    Create a fresh test database with schema initialized.
    
    Uses monkeypatch to patch get_db across all service modules.
    """
    import app.core.config as config
    
    # Setup test paths
    test_runs_dir = temp_db_path.parent / "runs"
    test_runs_dir.mkdir(parents=True, exist_ok=True)
    
    # Patch config values
    monkeypatch.setattr(config, "DATABASE_PATH", temp_db_path)
    monkeypatch.setattr(config, "RUNS_DIR", test_runs_dir)
    
    # Initialize the test database
    await _init_test_db(temp_db_path)
    
    # Create test get_db function
    @asynccontextmanager
    async def test_get_db():
        async with aiosqlite.connect(temp_db_path) as db:
            db.row_factory = aiosqlite.Row
            yield db
    
    # Patch get_db in all modules that use it
    import app.db.session
    import app.services.auth
    import app.services.api_keys
    import app.services.run_store
    
    monkeypatch.setattr(app.db.session, "get_db", test_get_db)
    monkeypatch.setattr(app.services.auth, "get_db", test_get_db)
    monkeypatch.setattr(app.services.api_keys, "get_db", test_get_db)
    monkeypatch.setattr(app.services.run_store, "get_db", test_get_db)
    
    # Yield the connection for test use
    async with aiosqlite.connect(temp_db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


@pytest.fixture
def sample_user_data() -> dict:
    """Sample user data for testing."""
    return {
        "email": "test@example.com",
        "password": "securepassword123"
    }


@pytest.fixture
def sample_run_data() -> dict:
    """Sample run data for testing."""
    return {
        "benchmark": "mmlu",
        "model": "gpt-4",
        "limit": 10,
        "temperature": 0.7,
    }


@pytest.fixture
def sample_api_key_data() -> dict:
    """Sample API key data for testing."""
    return {
        "provider": "openai",
        "key": "sk-test1234567890abcdefghijklmnopqrstuvwxyz",
    }


@pytest.fixture
def sample_stdout_with_results() -> str:
    """Sample stdout content with JSON results."""
    return """Running benchmark: mmlu
Model: gpt-4
Processing samples...
[============================] 100%
RESULTS: {"accuracy": 0.85, "total_samples": 100, "correct": 85}
Benchmark complete."""


@pytest.fixture
def sample_stdout_text_only() -> str:
    """Sample stdout content with text-only results."""
    return """Running benchmark: simple_qa
Model: gpt-3.5-turbo
Evaluation complete.
Accuracy: 72.5%
F1 Score: 0.68
Total samples: 200"""


@pytest.fixture
def artifact_dir_with_results(temp_dir: Path, sample_stdout_with_results: str) -> Path:
    """Create an artifact directory with sample results."""
    artifact_path = temp_dir / "test_run_123"
    artifact_path.mkdir(parents=True, exist_ok=True)
    
    # Write stdout.log
    (artifact_path / "stdout.log").write_text(sample_stdout_with_results)
    
    return artifact_path


@pytest.fixture
def artifact_dir_text_only(temp_dir: Path, sample_stdout_text_only: str) -> Path:
    """Create an artifact directory with text-only results."""
    artifact_path = temp_dir / "test_run_456"
    artifact_path.mkdir(parents=True, exist_ok=True)
    
    # Write stdout.log
    (artifact_path / "stdout.log").write_text(sample_stdout_text_only)
    
    return artifact_path
