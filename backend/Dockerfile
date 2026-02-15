# Backend Dockerfile - FastAPI with Python 3.11
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for cryptography, psutil, and git (required by inspect_ai)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better caching
COPY pyproject.toml README.md ./

# Install Python dependencies
RUN pip install --no-cache-dir hatchling && \
    pip install --no-cache-dir .

# Copy application code
COPY app/ ./app/

# Create data directory
RUN mkdir -p /app/data/runs

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8000

# Health check - uses /api/health endpoint which checks database connectivity
# Returns healthy/unhealthy status with database, version, and uptime info
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,json; r=urllib.request.urlopen('http://localhost:8000/api/health'); d=json.loads(r.read()); exit(0 if d.get('status')=='healthy' else 1)"

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]



