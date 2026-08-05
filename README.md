# School Financial System

A school financial management system with a FastAPI + SQLAlchemy backend
(PostgreSQL, Redis, Celery) and a React + Vite + TypeScript frontend.

Parents register their children, upload supporting documents, view monthly
fee schedules, receipts and statements, and choose a payment preference
(monthly installments or cumulative yearly payment). Administrators approve
registrations, manage grades and fee structures, allocate payments, and
issue receipts.

---

## Quick start (one command)

```bash
./scripts/setup_project.sh
```

This single script does everything:

1. Checks prerequisites (Python 3.12+, Node, npm)
2. Creates `.env` from `.env.example` with a generated `JWT_SECRET_KEY`
3. Creates a virtualenv and installs backend dependencies
4. Starts PostgreSQL + Redis via `docker compose` (or detects local services)
5. Applies database migrations (`alembic upgrade head`)
6. Installs frontend dependencies (`npm install`)
7. **Seeds demo users and demo data** — same accounts as the project's dev DB

The script is idempotent — safe to run again; existing records are left
untouched.

### After setup

```bash
# Terminal 1 — backend
make run                      # http://localhost:8000

# Terminal 2 — frontend
cd frontend && npm run dev    # http://localhost:3000
```

API docs: <http://localhost:8000/docs>

### Demo accounts (all passwords: `changeme`)

| Role    | Email                          |
|---------|--------------------------------|
| Admin   | `admin@school.com`             |
| Parent  | `parent.demo@school.com`       |
| Parent  | `parent.two@school.com`        |
| Parent  | `doc.parent@example.com`       |
| Parent  | `chain.parent@example.com`     |
| Parent  | `multi.parent@example.com`     |
| Parent  | `second.parent@example.com`    |
| Parent  | `kwame.mensah@example.com`     |
| Parent  | `moussa.diallo@example.com`    |
| Parent  | `new.parent.test@example.com`  |
| Parent  | `smoke.parent@school.com`      |

Demo children are seeded with guardians, and cover both registration states
(pending / approved) and both payment preferences (monthly / cumulative).

---

## Manual setup

Prerequisites: Python 3.12+, Node 18+, npm, PostgreSQL 16, Redis 7
(alternatively run `docker compose up -d db redis` for the services).

```bash
# 1. Environment
cp .env.example .env
#   edit .env — at minimum set a real JWT_SECRET_KEY and SUPERADMIN_PASSWORD

# 2. Backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3. Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

---

## Docker (full stack)

```bash
docker compose up -d          # postgres, redis, api, celery worker/beat, frontend
# frontend: http://localhost:3000   api: http://localhost:8000/docs
docker compose down           # stop
docker compose down -v        # stop and wipe volumes
```

---

## Configuration

Environment variables (see `.env.example`):

| Variable                | Default                                        | Notes                          |
|-------------------------|------------------------------------------------|--------------------------------|
| `DATABASE_URL`          | `postgresql+asyncpg://postgres:postgres@localhost:5432/school_finance` | SQLAlchemy async URL |
| `REDIS_URL`             | `redis://localhost:6379/0`                     | Celery broker / cache          |
| `CELERY_BROKER_URL`     | `redis://localhost:6379/1`                     |                                |
| `JWT_SECRET_KEY`        | `CHANGE-ME-IN-PRODUCTION`                      | **must be changed**            |
| `SUPERADMIN_EMAIL`      | `admin@school.com`                             | created at startup             |
| `SUPERADMIN_PASSWORD`   | `changeme`                                     | **must be changed**            |
| `DEBUG`                 | `false`                                        | `true` reveals reset tokens    |
| `CORS_ORIGINS`          | localhost 3000/5173                            | JSON list                      |
| `UPLOAD_DIR`            | `uploads`                                      | student documents              |
| `MAX_UPLOAD_SIZE_MB`    | `10`                                           | per file                       |

The app refuses to start (in non-debug mode) while `JWT_SECRET_KEY` or
`SUPERADMIN_PASSWORD` still use the insecure defaults.

---

## Development commands

| Command               | What it does                          |
|-----------------------|---------------------------------------|
| `make help`           | Show all targets                      |
| `make install`        | Install backend + frontend deps       |
| `make run`            | Start the API (port 8000)             |
| `make test`           | Run pytest suite                      |
| `make lint`           | ruff + eslint                         |
| `make typecheck`      | mypy + tsc                            |
| `make db-migrate msg="desc"` | Generate an alembic migration |
| `make db-upgrade`     | Apply migrations                      |
| `make docker-up`      | Start all Docker services             |

---

## Project layout

```
app/            FastAPI backend (api/v1 routes, services, models, schemas)
alembic/        Database migrations
frontend/       React + Vite + TypeScript frontend
scripts/        setup_project.sh — one-command setup + demo data
tests/          Backend test suite
docker-compose.yml / Makefile / Dockerfile
```

## Security notes

- `.env` is git-ignored; only `.env.example` is committed.
- All write endpoints are rate-limited; parents can only access their own
  children's data (ownership checks server-side).
- Passwords are hashed with bcrypt; password-reset tokens are stored hashed
  and expire after 1 hour.
- Uploaded documents are stored outside the web root and served through the
  API with ownership checks.
