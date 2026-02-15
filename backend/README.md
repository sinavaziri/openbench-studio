# OpenBench Web Backend

FastAPI backend for running OpenBench benchmarks via a web UI.

## Setup

```bash
pip install -e .
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## Configuration

All configuration is managed through environment variables with the `OPENBENCH_` prefix. 
Copy `.env.example` to `.env` and configure your settings.

### Required Variables (Production)

| Variable | Description |
|----------|-------------|
| `OPENBENCH_SECRET_KEY` | JWT signing secret (min 32 chars) |
| `OPENBENCH_ENCRYPTION_KEY` | API key encryption key (exactly 32 chars) |

Generate secure keys:
```bash
# Secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Encryption key
python -c "import secrets; print(secrets.token_urlsafe(32)[:32])"
```

### All Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| **Environment** |||
| `OPENBENCH_ENV` | Environment name (development/staging/production) | `development` |
| **Authentication** |||
| `OPENBENCH_SECRET_KEY` | JWT signing secret (min 32 chars) | Random (dev only) |
| `OPENBENCH_ENCRYPTION_KEY` | API key encryption key (32 chars) | Random (dev only) |
| `OPENBENCH_ALGORITHM` | JWT algorithm | `HS256` |
| `OPENBENCH_ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration | `10080` (7 days) |
| **Server** |||
| `OPENBENCH_HOST` | Server bind host | `0.0.0.0` |
| `OPENBENCH_PORT` | Server bind port | `8000` |
| `OPENBENCH_DEBUG` | Enable debug mode | `false` |
| `OPENBENCH_LOG_LEVEL` | Log level (debug/info/warning/error) | `info` |
| **API** |||
| `OPENBENCH_API_PREFIX` | API route prefix | `/api` |
| `OPENBENCH_API_CORS_ORIGINS` | Allowed CORS origins (comma-separated) | localhost dev servers |
| **Database** |||
| `OPENBENCH_DB_PATH` | SQLite database path | `{DATA_DIR}/openbench.db` |
| `OPENBENCH_DB_ECHO` | Enable SQL query logging | `false` |

### Configuration Validation

The application validates configuration on startup. Missing or invalid required 
variables will cause a clear error message:

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for AuthSettings
OPENBENCH_SECRET_KEY
  Value error, OPENBENCH_SECRET_KEY must be at least 32 characters. 
  Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Programmatic Access

Configuration is available through the `Settings` class:

```python
from app.core.config import get_settings, get_current_settings

# Get settings instance
settings = get_settings()

# Access nested config
print(settings.auth.secret_key)
print(settings.db.path)
print(settings.server.port)

# Use in FastAPI dependencies
from fastapi import Depends

@app.get("/debug/config")
async def debug_config(settings = Depends(get_current_settings)):
    return {"env": settings.environment}
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### API Keys
- `GET /api/api-keys` - List configured API keys
- `POST /api/api-keys` - Add/update API key
- `DELETE /api/api-keys/{provider}` - Remove API key

### Benchmarks
- `GET /api/benchmarks` - List available benchmarks
- `GET /api/benchmarks/{name}` - Get benchmark details

### Runs
- `POST /api/runs` - Start a new run
- `GET /api/runs` - List all runs
- `GET /api/runs/{id}` - Get run details
- `POST /api/runs/{id}/cancel` - Cancel a run
- `GET /api/runs/{id}/events` - SSE stream for live updates

### Health
- `GET /api/health` - Health check

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

## Docker

```bash
docker build -t openbench-backend .
docker run -p 8000:8000 \
  -e OPENBENCH_SECRET_KEY="your-secret-key-here-min-32-chars" \
  -e OPENBENCH_ENCRYPTION_KEY="your-encryption-key-32chars" \
  -v ./data:/app/data \
  openbench-backend
```
