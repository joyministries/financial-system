"""Vercel serverless entrypoint for the FastAPI backend.

Vercel Python functions expose a `handler` callable; Mangum adapts the ASGI
app to the serverless function contract. All paths are rewritten here via
vercel.json (`/(.*)` -> `/api/index`), so the full API surface (`/api/v1/*`,
`/health`, `/pay/{id}`, PayFast notify/return) is served by this one function.

No Celery/Redis on Vercel — the scheduler runs through Vercel Cron hitting
`/api/v1/system/cron/daily` (see vercel.json `crons`).
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="auto")
