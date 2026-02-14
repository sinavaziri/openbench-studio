# Development Setup

This guide explains how to run OpenBench in development mode with hot reloading enabled.

## Development Mode (Hot Reload)

Development mode enables automatic code reloading so changes propagate immediately without rebuilding containers.

### Start Development Environment

```bash
docker-compose -f docker-compose.dev.yml up --build
```

The `--build` flag is only needed on first run or when dependencies change.

### Start Without Rebuilding

After the initial build, simply run:

```bash
docker-compose -f docker-compose.dev.yml up
```

### Stop Development Environment

```bash
docker-compose -f docker-compose.dev.yml down
```

## What's Included

### Backend (FastAPI)
- **Hot Reload**: Enabled via `uvicorn --reload`
- **Mounted Volumes**: `/backend/app` directory is mounted
- **Auto-restart**: Changes to Python files trigger automatic restart
- **Port**: Backend runs on internal port 8000

### Frontend (React + Vite)
- **Hot Module Replacement (HMR)**: Instant updates without page refresh
- **Mounted Volumes**: Source files, configs, and public assets
- **Fast Refresh**: React components update without losing state
- **Port**: Frontend accessible at http://localhost:3000 (or custom `OPENBENCH_PORT`)

## Making Changes

### Frontend Changes
1. Edit files in `frontend/src/`
2. Save the file
3. Browser updates automatically (no page refresh needed)

### Backend Changes
1. Edit files in `backend/app/`
2. Save the file
3. Uvicorn detects changes and restarts automatically (1-2 second delay)

### Configuration Changes
Changes to these files require container restart:
- `package.json` / `pyproject.toml` (dependencies)
- `Dockerfile.dev` files
- `docker-compose.dev.yml`

To restart after config changes:
```bash
docker-compose -f docker-compose.dev.yml restart
```

## Database Migrations

OpenBench uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations. Migrations run automatically on application startup.

### How It Works

- **Automatic migrations**: The app runs pending migrations on startup
- **Safe for existing databases**: Existing databases are detected and stamped without re-running migrations
- **SQLite with batch mode**: Uses Alembic's batch mode to handle SQLite's limited ALTER TABLE support

### Creating a New Migration

When you modify the database schema in `backend/app/db/sa_models.py`:

```bash
cd backend

# Auto-generate migration from model changes
alembic revision --autogenerate -m "add user preferences table"

# Or create an empty migration to fill in manually
alembic revision -m "custom data migration"
```

The migration file is created in `backend/alembic/versions/`. Review and edit it before committing.

### Migration Commands

```bash
cd backend

# Check current database revision
alembic current

# Show migration history
alembic history

# Upgrade to latest
alembic upgrade head

# Upgrade one revision
alembic upgrade +1

# Downgrade one revision
alembic downgrade -1

# Show pending migrations
alembic heads

# Generate SQL without executing (for review)
alembic upgrade head --sql
```

### Best Practices

1. **Always review auto-generated migrations** - Alembic's autogenerate is helpful but not perfect
2. **Test migrations locally** before deploying
3. **Keep migrations small and focused** - one logical change per migration
4. **Never edit applied migrations** - create new ones instead
5. **Include downgrade logic** when possible

### Schema Definition

- **Pydantic models** (`app/db/models.py`): API validation and serialization
- **SQLAlchemy models** (`app/db/sa_models.py`): Database schema for Alembic

When changing the schema, update both files to keep them in sync.

### Troubleshooting Migrations

**Migration fails on existing database:**
```bash
# Mark the database as current without running migrations
cd backend
alembic stamp head
```

**Need to recreate from scratch:**
```bash
# Delete the database and let migrations recreate it
rm data/openbench.db
# Restart the app - migrations will create fresh tables
```

**Check what changes would be detected:**
```bash
cd backend
alembic check
```

## Production Mode

For production deployment, use the standard docker-compose file:

```bash
docker-compose up -d
```

This uses optimized production builds with nginx serving the frontend.

## Troubleshooting

### Changes not reflecting?

1. **Check container logs**:
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f frontend
   docker-compose -f docker-compose.dev.yml logs -f backend
   ```

2. **Hard restart containers**:
   ```bash
   docker-compose -f docker-compose.dev.yml restart
   ```

3. **Rebuild if dependencies changed**:
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

### Port already in use?

Change the port in your environment:
```bash
export OPENBENCH_PORT=3001
docker-compose -f docker-compose.dev.yml up
```

### File watching not working?

Some systems (especially Windows with WSL) may need polling enabled. This is already configured in `vite.config.ts` with `usePolling: true`.

## Tips

- Keep containers running while developing
- Check logs if changes aren't appearing
- Only rebuild when dependencies change
- Use `docker-compose.dev.yml` for development
- Use `docker-compose.yml` for production

