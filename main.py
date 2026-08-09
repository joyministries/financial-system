"""Vercel entrypoint for the FastAPI backend.

Vercel's Python runtime detects FastAPI automatically and looks for an `app`
instance at a recognised top-level entrypoint (main.py is one of them).

Placing the entrypoint at the repo root (not inside api/) ensures Vercel
does NOT strip any path prefix — requests arrive at the function with their
full path intact (/api/v1/*, /health, /pay/{id}, etc.).

No Celery/Redis on Vercel — the scheduler runs through Vercel Cron hitting
/api/v1/system/cron/daily (see vercel.json `crons`).
"""

from app.main import app  # noqa: F401  — Vercel looks for `app`
