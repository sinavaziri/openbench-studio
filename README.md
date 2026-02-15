# OpenBench Web UI

[![CI](https://github.com/openbench/openbench-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/openbench/openbench-studio/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/openbench/openbench-studio/branch/main/graph/badge.svg)](https://codecov.io/gh/openbench/openbench-studio)

A modern web interface for running and managing OpenBench benchmarks.

## Features

- **Run Benchmarks**: Select benchmarks and models, configure settings, and start runs from the UI
- **Live Progress**: Real-time log streaming and progress updates via SSE
- **Results Viewer**: Structured metrics, breakdowns, and visualizations
- **Compare Runs**: Side-by-side comparison of multiple benchmark runs
- **Multi-User Auth**: User accounts with secure API key storage
- **Reproducibility**: Every run stores its config, exact command, and all artifacts

## Quick Start with Docker

The easiest way to run OpenBench Web UI is with Docker Compose:

```bash
# Clone and navigate to the project
cd Openbench

# Start the application
docker compose up --build

# Access the UI at http://localhost:3000
```

### Configuration

Set environment variables for production:

```bash
# Generate secure keys
export OPENBENCH_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
export OPENBENCH_ENCRYPTION_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32)[:32])")

# Optional: Change the port (default: 3000)
export OPENBENCH_PORT=8080

# Start with custom config
docker compose up --build
```

### Data Persistence

Run data is persisted in the `./data` directory:
- `data/openbench.db` - SQLite database (users, runs metadata)
- `data/runs/` - Run artifacts (configs, logs, results)

## Development Mode (Hot Reload)

For active development with automatic code reloading:

```bash
# Start development environment with hot reload
./dev.sh build  # First time or when dependencies change
./dev.sh        # Subsequent starts

# View logs
./dev.sh logs frontend  # Frontend only
./dev.sh logs backend   # Backend only

# Stop
./dev.sh down
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development setup instructions.

## Local Development (Without Docker)

### Backend

```bash
cd backend

# Install dependencies
pip install -e .

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run the dev server
npm run dev
```

The frontend dev server runs on port 5173 and proxies API requests to the backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Tailwind)              │
│  Dashboard │ New Run │ Run Detail │ Compare │ Settings       │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/*
┌──────────────────────────▼──────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  Auth │ Benchmarks │ Runs │ API Keys │ SSE Streaming         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Data Layer                                │
│  SQLite DB │ Run Artifacts (data/runs/<run_id>/)             │
└─────────────────────────────────────────────────────────────┘
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
- `GET /api/api-keys/providers` - List supported providers

### Benchmarks
- `GET /api/benchmarks` - List available benchmarks
- `GET /api/benchmarks/{name}` - Get benchmark details

### Runs
- `POST /api/runs` - Start a new run
- `GET /api/runs` - List runs
- `GET /api/runs/{id}` - Get run details
- `POST /api/runs/{id}/cancel` - Cancel a running run
- `GET /api/runs/{id}/events` - SSE stream for live updates

### Health
- `GET /api/health` - Health check

## Run Artifacts

Each run stores artifacts in `data/runs/<run_id>/`:

```
data/runs/<run_id>/
├── config.json      # Run configuration
├── command.txt      # Exact CLI command executed
├── meta.json        # Timestamps, status, exit code
├── stdout.log       # Standard output
├── stderr.log       # Standard error
└── summary.json     # Parsed results (if available)
```

## Testing

Run the backend test suite:

```bash
cd backend

# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run specific test file
pytest tests/test_routes_auth.py

# Run with verbose output
pytest -v
```

### Pre-commit Hooks

Set up pre-commit hooks for code quality:

```bash
pip install pre-commit
pre-commit install
```

This will run linting and formatting checks before each commit.

## License

MIT
