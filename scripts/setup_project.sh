#!/usr/bin/env bash
#
# setup_project.sh — one-command setup for the School Financial System.
#
# What it does:
#   1. Checks prerequisites (Python 3.12+, Node, npm, Docker or local services)
#   2. Creates .env from .env.example (with a generated JWT secret) if missing
#   3. Creates a virtualenv and installs the backend package
#   4. Starts PostgreSQL + Redis (via docker compose, unless already reachable)
#   5. Applies database migrations (alembic upgrade head)
#   6. Installs frontend dependencies
#   7. Seeds demo users + demo data (the same accounts used in this project's
#      dev database — see "Demo accounts" printed at the end)
#
# Usage:
#   ./scripts/setup_project.sh
#
# Idempotent: safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

check_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        fail "Missing required command: $1"
    fi
}

port_open() {  # port_open <host> <port>
    timeout 2 bash -c "cat < /dev/null > /dev/tcp/$1/$2" >/dev/null 2>&1
}

wait_for_db() {
    info "Waiting for PostgreSQL on ${DB_HOST}:${DB_PORT}..."
    for _ in $(seq 1 30); do
        if port_open "$DB_HOST" "$DB_PORT"; then
            ok "PostgreSQL is reachable"
            return 0
        fi
        sleep 2
    done
    fail "PostgreSQL did not become reachable at ${DB_HOST}:${DB_PORT}. Check Docker or your local service."
}

# ---------------------------------------------------------------------------
# 1. prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."
check_cmd python3
check_cmd node
check_cmd npm

PY_MAJOR=$(python3 -c 'import sys; print(sys.version_info[0])')
PY_MINOR=$(python3 -c 'import sys; print(sys.version_info[1])')
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 12 ]; }; then
    fail "Python 3.12+ is required (found $(python3 --version))."
fi
ok "Python $(python3 --version | awk '{print $2}'), node $(node --version), npm $(npm --version)"

# ---------------------------------------------------------------------------
# 2. environment file
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
    info "Creating .env from .env.example..."
    cp .env.example .env
    JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | tr -dc 'a-f0-9')"
    # Only replace the placeholder value, never an existing real secret.
    sed -i.bak "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=${JWT_SECRET}|" .env && rm -f .env.bak
    ok ".env created with a generated JWT_SECRET_KEY"
else
    info ".env already exists — leaving it untouched"
fi

# ---------------------------------------------------------------------------
# 3. backend virtualenv + dependencies
# ---------------------------------------------------------------------------
if [ ! -d .venv ]; then
    info "Creating virtualenv..."
    python3 -m venv .venv
fi
info "Installing backend dependencies (pip install -e '.[dev]')..."
.venv/bin/pip install -q -e ".[dev]"
ok "Backend dependencies installed"

# ---------------------------------------------------------------------------
# 4. services (PostgreSQL + Redis)
# ---------------------------------------------------------------------------
DB_HOST=$(grep -E '^DATABASE_URL=' .env | sed -E 's#.*://[^@]*@([^:/]+).*#\1#' | tr -d '[:space:]')
DB_PORT=$(grep -E '^DATABASE_URL=' .env | sed -E 's#.*://[^@]*@[^:/]+:([0-9]+).*#\1#' | tr -d '[:space:]')
DB_PORT="${DB_PORT:-5432}"
DB_HOST="${DB_HOST:-localhost}"

if port_open "$DB_HOST" "$DB_PORT"; then
    ok "PostgreSQL already running at ${DB_HOST}:${DB_PORT}"
elif command -v docker >/dev/null 2>&1; then
    info "Starting PostgreSQL + Redis via docker compose..."
    docker compose up -d db redis
    wait_for_db
else
    fail "No PostgreSQL at ${DB_HOST}:${DB_PORT} and Docker is not installed. Install Docker or start PostgreSQL locally, then re-run."
fi

if ! port_open localhost 6379; then
    info "Redis not reachable on 6379 — starting via docker compose..."
    if command -v docker >/dev/null 2>&1; then
        docker compose up -d redis
    else
        fail "Redis is not running on localhost:6379 and Docker is not installed."
    fi
else
    ok "Redis already running on localhost:6379"
fi

# ---------------------------------------------------------------------------
# 5. migrations
# ---------------------------------------------------------------------------
info "Applying database migrations..."
.venv/bin/alembic upgrade head
ok "Migrations applied"

# ---------------------------------------------------------------------------
# 6. frontend dependencies
# ---------------------------------------------------------------------------
info "Installing frontend dependencies (npm install)..."
(cd frontend && npm install)
ok "Frontend dependencies installed"

# ---------------------------------------------------------------------------
# 7. seed demo data
# ---------------------------------------------------------------------------
info "Seeding demo users and demo data..."
.venv/bin/python - <<'PYEOF'
"""Seed demo users + demo data (embedded in setup_project.sh).

Replicates the demo accounts and records from the project's dev database:
  * all parent demo accounts (password: changeme)
  * the "Grade 1" grade and its 2026 Tuition fee structure
  * a few demo students with guardians and enrollments, covering the
    states used by the UI (pending / approved, monthly / cumulative)

Idempotent: existing records are left untouched.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from decimal import Decimal

sys.path.insert(0, os.getcwd())

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.financial import FeeStructure
from app.models.grade import Grade, Student, StudentGuardian
from app.models.schedule import Enrollment
from app.models.user import User

GRADE_ID = "62d863f9-49db-4857-a20d-b23004c5377f"  # "Grade 1"
ACADEMIC_YEAR = 2026

# admin@school.com is created automatically at startup from SUPERADMIN_EMAIL /
# SUPERADMIN_PASSWORD in .env, so it is not seeded here.
DEMO_USERS = [
    {"email": "parent.demo@school.com", "password": "changeme", "full_name": "Demo Parent", "role": "parent", "is_active": True},
    {"email": "parent.two@school.com", "password": "changeme", "full_name": "Second Parent", "role": "parent", "is_active": True},
    {"email": "doc.parent@example.com", "password": "changeme", "full_name": "Dora Parent", "role": "parent", "is_active": True},
    {"email": "chain.parent@example.com", "password": "changeme", "full_name": "Chain Parent", "role": "parent", "is_active": True},
    {"email": "multi.parent@example.com", "password": "changeme", "full_name": "Multi Parent", "role": "parent", "is_active": True},
    {"email": "second.parent@example.com", "password": "changeme", "full_name": "Grace Mwansa", "role": "parent", "is_active": True},
    {"email": "kwame.mensah@example.com", "password": "changeme", "full_name": "Kwame Mensah", "role": "parent", "is_active": True},
    {"email": "moussa.diallo@example.com", "password": "changeme", "full_name": "Moussa Diallo", "role": "parent", "is_active": True},
    {"email": "new.parent.test@example.com", "password": "changeme", "full_name": "New Parent Test", "role": "parent", "is_active": True},
    {"email": "smoke.parent@school.com", "password": "changeme", "full_name": "Smoke Parent", "role": "parent", "is_active": True},
    {"email": "father.tendai@example.com", "password": "changeme", "full_name": "Brian Mwansa", "role": "parent", "is_active": False},
    {"email": "xss.parent@example.com", "password": "changeme", "full_name": "<img src=x onerror=alert(1)> Smith", "role": "parent", "is_active": False},
]

DEMO_STUDENTS = [
    {
        "student_number": "TST-1002",
        "first_name": "Kofi", "last_name": "Mensah",
        "parent_email": "kwame.mensah@example.com",
        "enrollment_date": "2026-08-04T00:00:00+03:00",
        "is_active": True, "registration_status": "approved", "payment_preference": "monthly",
        "guardians": [
            {"guardian_type": "primary", "full_name": "Kwame Mensah", "guardian_id": "P-201", "phone": "0700555666", "email": "kwame.mensah@example.com"},
        ],
    },
    {
        "student_number": "TST-1001",
        "first_name": "Amina", "last_name": "Diallo",
        "parent_email": "moussa.diallo@example.com",
        "enrollment_date": "2026-08-04T00:00:00+03:00",
        "is_active": True, "registration_status": "approved", "payment_preference": "monthly",
        "guardians": [
            {"guardian_type": "primary", "full_name": "Moussa Diallo", "guardian_id": "P-101", "phone": "0700111222", "email": "moussa.diallo@example.com"},
            {"guardian_type": "secondary", "full_name": "Fatou Diallo", "guardian_id": "P-102", "phone": "0700333444", "email": "fatou.diallo@example.com"},
        ],
    },
    {
        "student_number": "REG-2026-DDA91A",
        "first_name": "Farai", "last_name": "Moyo",
        "parent_email": "doc.parent@example.com",
        "enrollment_date": "2026-08-05T11:22:42+03:00",
        "is_active": True, "registration_status": "pending", "payment_preference": "cumulative",
        "guardians": [
            {"guardian_type": "mother", "full_name": "Dora Parent", "phone": "+263772111222", "email": "doc.parent@example.com", "physical_address": "12 Main Rd, Harare", "po_box": "Box 99"},
            {"guardian_type": "father", "full_name": "Tinashe Moyo", "guardian_id": "ID-7788", "phone": "+263773333444", "email": "tinashe.moyo@example.com", "physical_address": "12 Main Rd, Harare"},
        ],
    },
    {
        "student_number": "REG-2026-A3A9D7",
        "first_name": "Zane", "last_name": "Parent",
        "parent_email": "chain.parent@example.com",
        "enrollment_date": "2026-08-05T07:42:32+03:00",
        "is_active": True, "registration_status": "pending", "payment_preference": "cumulative",
        "guardians": [
            {"guardian_type": "mother", "full_name": "Maria Parent", "phone": "+260960001111", "email": "maria.parent@example.com", "physical_address": "Plot 4, Chilenje, Lusaka"},
            {"guardian_type": "father", "full_name": "Chain Parent Jr", "phone": "+260971112222", "email": "chain.parent@example.com", "physical_address": "Plot 4, Chilenje, Lusaka", "po_box": "PO Box 10001, Lusaka"},
        ],
    },
]


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


async def seed_users(db) -> None:
    for u in DEMO_USERS:
        result = await db.execute(select(User).where(User.email == u["email"]))
        if result.scalar_one_or_none():
            print(f"  user exists: {u['email']}")
            continue
        db.add(User(
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            full_name=u["full_name"],
            role=u["role"],
            is_active=u["is_active"],
        ))
        print(f"  user created: {u['email']} / {u['password']}")


async def seed_grade(db) -> None:
    result = await db.execute(select(Grade).where(Grade.id == GRADE_ID))
    if result.scalar_one_or_none() is None:
        db.add(Grade(id=GRADE_ID, name="Grade 1", description="", is_active=True))
        print("  grade created: Grade 1")
    else:
        print("  grade exists: Grade 1")

    result = await db.execute(
        select(FeeStructure).where(
            FeeStructure.grade_id == GRADE_ID,
            FeeStructure.academic_year == ACADEMIC_YEAR,
        )
    )
    if result.scalar_one_or_none() is None:
        db.add(FeeStructure(
            grade_id=GRADE_ID,
            academic_year=ACADEMIC_YEAR,
            category="Tuition",
            annual_amount=Decimal("12000.00"),
            monthly_installment=None,
            payment_plan="yearly",
            is_active=True,
        ))
        print("  fee structure created: 2026 Tuition (12000.00 / year)")
    else:
        print("  fee structure exists: 2026 Tuition")


async def seed_students(db) -> None:
    for s in DEMO_STUDENTS:
        result = await db.execute(select(Student).where(Student.student_number == s["student_number"]))
        if result.scalar_one_or_none():
            print(f"  student exists: {s['student_number']}")
            continue

        parent_result = await db.execute(select(User).where(User.email == s["parent_email"]))
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            print(f"  SKIP student {s['student_number']}: parent {s['parent_email']} not found")
            continue

        student = Student(
            student_number=s["student_number"],
            first_name=s["first_name"],
            last_name=s["last_name"],
            grade_id=GRADE_ID,
            parent_id=parent.id,
            enrollment_date=_parse_dt(s["enrollment_date"]),
            is_active=s["is_active"],
            registration_status=s["registration_status"],
            payment_preference=s["payment_preference"],
        )
        db.add(student)
        await db.flush()

        for g in s.get("guardians", []):
            db.add(StudentGuardian(
                student_id=student.id,
                guardian_type=g["guardian_type"],
                full_name=g["full_name"],
                guardian_id=g.get("guardian_id"),
                phone=g.get("phone"),
                email=g.get("email"),
                physical_address=g.get("physical_address"),
                po_box=g.get("po_box"),
            ))

        if s["registration_status"] == "approved":
            db.add(Enrollment(
                student_id=student.id,
                academic_year=ACADEMIC_YEAR,
                grade_id=GRADE_ID,
            ))
        print(f"  student created: {s['student_number']} {s['first_name']} {s['last_name']} ({s['registration_status']}, {s['payment_preference']})")


async def main() -> None:
    async with async_session_factory() as db:
        await seed_users(db)
        await seed_grade(db)
        await seed_students(db)
        await db.commit()
    print("Seeding complete.")


if __name__ == "__main__":
    asyncio.run(main())
PYEOF
ok "Demo data seeded"

# ---------------------------------------------------------------------------
# 8. summary
# ---------------------------------------------------------------------------
cat <<'EOF'

============================================================
  School Financial System — setup complete
============================================================

  Run the backend:
      make run            # uvicorn on http://localhost:8000
      # or: .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

  Run the frontend (separate terminal):
      cd frontend && npm run dev   # http://localhost:3000

  API docs:   http://localhost:8000/docs

  Demo accounts (password: changeme)
      Admin:   admin@school.com
      Parents: parent.demo@school.com
               parent.two@school.com
               doc.parent@example.com
               chain.parent@example.com
               multi.parent@example.com
               second.parent@example.com
               kwame.mensah@example.com
               moussa.diallo@example.com
               new.parent.test@example.com
               smoke.parent@school.com

  Demo children
      Farai Moyo  REG-2026-DDA91A  (pending, cumulative)  -> doc.parent
      Zane Parent REG-2026-A3A9D7  (pending, cumulative)  -> chain.parent
      Kofi Mensah TST-1002         (approved, monthly)    -> kwame.mensah
      Amina Diallo TST-1001        (approved, monthly)    -> moussa.diallo

  Useful commands: make help | make test | make lint | make db-upgrade
============================================================
EOF
