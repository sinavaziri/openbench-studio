# Backend Dockerfile - FastAPI with Python 3.11
# Works when built from repo root (Railway) or backend/ dir (local)
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files (handle both build contexts)
COPY backend/pyproject.toml backend/README.md ./

# Install Python dependencies
RUN pip install --no-cache-dir hatchling && \
    pip install --no-cache-dir .

# Copy application code
COPY backend/app/ ./app/
COPY backend/alembic/ ./alembic/
COPY backend/alembic.ini ./

# Create data directory
RUN mkdir -p /app/data/runs

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,json; r=urllib.request.urlopen('http://localhost:8000/api/health'); d=json.loads(r.read()); exit(0 if d.get('status')=='healthy' else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
