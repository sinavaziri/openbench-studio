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
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import aiosqlite

# Set test environment variables BEFORE importing app modules
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32-chars-xxx"  # Exactly 32 chars


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
                scheduled_for TEXT,
                artifact_dir TEXT,
                exit_code INTEGER,
                error TEXT,
                config_json TEXT,
                primary_metric REAL,
                primary_metric_name TEXT,
                tags_json TEXT DEFAULT '[]',
                notes TEXT,
                template_id TEXT,
                template_name TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        
        # Templates table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS templates (
                template_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                benchmark TEXT NOT NULL,
                model TEXT NOT NULL,
                config_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        
        # Notification settings table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notification_settings (
                user_id TEXT PRIMARY KEY,
                email_enabled INTEGER DEFAULT 0,
                email_address TEXT,
                webhook_enabled INTEGER DEFAULT 0,
                webhook_url TEXT,
                notify_on_complete INTEGER DEFAULT 1,
                notify_on_fail INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
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
    import app.services.template_store
    
    monkeypatch.setattr(app.db.session, "get_db", test_get_db)
    monkeypatch.setattr(app.services.auth, "get_db", test_get_db)
    monkeypatch.setattr(app.services.api_keys, "get_db", test_get_db)
    monkeypatch.setattr(app.services.run_store, "get_db", test_get_db)
    monkeypatch.setattr(app.services.template_store, "get_db", test_get_db)
    
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
def sample_template_data() -> dict:
    """Sample template data for testing."""
    return {
        "name": "Test Template",
        "benchmark": "mmlu",
        "model": "openai/gpt-4o",
        "config": {
            "limit": 100,
            "temperature": 0.5,
        }
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


@pytest.fixture
def mock_benchmark_catalog():
    """Mock benchmark catalog for testing."""
    return [
        {
            "name": "mmlu",
            "category": "Knowledge",
            "description_short": "Massive Multitask Language Understanding",
            "description": "MMLU tests models on 57 subjects",
            "tags": ["knowledge", "multiple-choice"],
            "featured": True,
            "source": "builtin",
        },
        {
            "name": "gsm8k",
            "category": "Math",
            "description_short": "Grade School Math",
            "description": "Math word problems",
            "tags": ["math", "reasoning"],
            "featured": True,
            "source": "builtin",
        },
        {
            "name": "humaneval",
            "category": "Coding",
            "description_short": "Human Eval",
            "description": "Code generation benchmark",
            "tags": ["coding", "generation"],
            "featured": True,
            "source": "builtin",
        },
    ]


@pytest.fixture
def mock_executor():
    """Mock executor for testing run creation without actual execution."""
    with patch('app.runner.executor.executor') as mock:
        mock.execute_run = AsyncMock()
        mock.cancel_run = AsyncMock(return_value=True)
        yield mock


@pytest.fixture
def mock_model_discovery():
    """Mock model discovery service."""
    from app.services.model_discovery import ModelInfo, ModelProvider
    
    mock_providers = [
        ModelProvider(
            name="OpenAI",
            provider_key="openai",
            models=[
                ModelInfo(id="openai/gpt-4o", name="GPT-4o"),
                ModelInfo(id="openai/gpt-4-turbo", name="GPT-4 Turbo"),
            ],
            error=None,
        ),
        ModelProvider(
            name="Anthropic",
            provider_key="anthropic",
            models=[
                ModelInfo(id="anthropic/claude-3-opus", name="Claude 3 Opus"),
            ],
            error=None,
        ),
    ]
    
    with patch('app.services.model_discovery.model_discovery_service') as mock:
        mock.get_available_models = AsyncMock(return_value=mock_providers)
        yield mock


# ============================================================================
# HTTP Client fixtures
# ============================================================================

@pytest_asyncio.fixture
async def client(test_db):
    """Create an async test client for API testing."""
    import sys
    from httpx import AsyncClient, ASGITransport
    
    # Mock migrations module before importing app.main
    mock_migrations = MagicMock()
    mock_migrations.run_migrations = MagicMock()
    sys.modules['app.db.migrations'] = mock_migrations
    
    from app.main import app
    
    # Mock the scheduler to prevent it from running during tests
    with patch('app.services.scheduler.scheduler.start', new_callable=AsyncMock):
        with patch('app.services.scheduler.scheduler.stop', new_callable=AsyncMock):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac


@pytest_asyncio.fixture
async def authenticated_client(client):
    """Create a test client with authentication."""
    from app.services.auth import auth_service
    from app.db.models import UserCreate
    
    # Create a test user
    user_create = UserCreate(email="testuser@example.com", password="testpassword123")
    user = await auth_service.create_user(user_create)
    
    # Get token
    token = auth_service.create_user_token(user)
    
    # Add auth header to client
    client.headers["Authorization"] = f"Bearer {token.access_token}"
    
    yield client, {"user": user, "token": token}
