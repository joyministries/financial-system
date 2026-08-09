"""Vercel entrypoint for the FastAPI backend.

Vercel's Python runtime detects FastAPI automatically and looks for an `app`
instance at a recognised entrypoint (api/index.py is one of them).  No
adapter (Mangum/WSGI wrapper) is required — Vercel handles ASGI natively.

All paths are routed here via vercel.json rewrites, so the full API surface
(/api/v1/*, /health, /pay/{id}, PayFast notify/return) is served by this
single function.

No Celery/Redis on Vercel — the scheduler runs through Vercel Cron hitting
/api/v1/system/cron/daily (see vercel.json `crons`).
"""

from app.main import app  # noqa: F401  — Vercel looks for `app`
