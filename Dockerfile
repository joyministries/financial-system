# Production image for Render (and any container host).
# Local dev uses docker-compose.yml which overrides the CMD for hot reload.
FROM python:3.12-slim

WORKDIR /app

# build-essential: some wheels (asyncpg, bcrypt) may compile from source on slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install the package and its runtime deps so the layer stays cached across deploys.
# app/ + alembic/ must be present for setuptools to build the wheel cleanly.
COPY pyproject.toml .
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
RUN pip install --no-cache-dir .

# Copy everything else (scripts/, tests/, ...) — no secrets: .dockerignore excludes .env.
COPY . .

EXPOSE 8000

# Render injects $PORT (default 10000). Fall back to 8000 for local docker run.
# Gunicorn with uvicorn workers is the recommended prod server for FastAPI.
CMD ["sh", "-c", "alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --timeout 120"]
