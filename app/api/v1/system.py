"""Serverless-friendly system endpoints.

Vercel has no persistent worker, so the Celery beat scheduler cannot run
there. These endpoints mirror the same idempotent job logic and are invoked
by Vercel Cron (which sets the `x-vercel-cron` header) or manually with the
CRON_SECRET bearer token. They also work on Render as a manual fallback when
the beat worker is down.

Guard rules:
- Requests that present `x-vercel-cron: 1` (set by Vercel Cron, cannot be
  spoofed from outside) are always accepted.
- Requests may alternatively send `Authorization: Bearer <CRON_SECRET>`.
- If CRON_SECRET is empty, bearer auth is rejected and only Vercel Cron may
  trigger these endpoints.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session_factory
from app.services.balance import BalanceEngine
from app.services.notification import NotificationService
from app.services.receipt import ReceiptService
from app.services.reminder import due_reminder_index, send_payment_link_reminders
from app.services.setting import SettingService
from app.services.sms import SmsNotConfiguredError
from app.services.statement import StatementService

router = APIRouter(prefix="/system", tags=["System"])

settings = get_settings()

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _is_authorized(
    x_vercel_cron: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> bool:
    if x_vercel_cron == "1":
        return True
    if settings.CRON_SECRET and authorization:
        return authorization == f"Bearer {settings.CRON_SECRET}"
    return False


def _require_authorization(authorized: bool) -> None:
    if not authorized:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cron endpoints require x-vercel-cron header or CRON_SECRET bearer token",
        )


@router.post("/cron/daily")
async def run_daily_jobs(
    authorized: bool = Depends(_is_authorized),
) -> dict:
    """Daily payment-link reminder scheduler (replaces beat's run_reminder_scheduler).

    Fires reminder N on start_date + (N-1) * interval_days. Idempotent per day
    via the last_run_date guard; skips cleanly when disabled/unconfigured.
    """
    _require_authorization(authorized)

    # Always run notification cleanup first — independent of reminder config.
    async with async_session_factory() as db:
        service = NotificationService(db)
        cleaned = await service.purge_viewed(settings.READ_NOTIFICATION_RETENTION_SECONDS)
        await db.commit()

    async with async_session_factory() as db:
        setting_service = SettingService(db)
        config = await setting_service.get_reminder_config()
        if not config.get("enabled"):
            return {"status": "skipped_disabled", "read_notifications_cleaned": cleaned}

        idx = due_reminder_index(config)
        if idx is None:
            return {"status": "not_due"}

        today = date.today().isoformat()
        if config.get("last_run_date") == today:
            return {"status": "already_fired_today"}

        try:
            result = await send_payment_link_reminders(db)
        except SmsNotConfiguredError:
            return {"status": "error", "error": "SMS channel not configured"}

        await setting_service.record_reminder_run(idx + 1)
        await db.commit()
        return {
            "status": "sent",
            "reminder": idx + 1,
            "read_notifications_cleaned": cleaned,
            **result,
        }


@router.post("/cron/monthly")
async def run_monthly_jobs(
    authorized: bool = Depends(_is_authorized),
) -> dict:
    """Monthly close: rollover balances, generate statements and missing receipts."""
    _require_authorization(authorized)

    from app.models.financial import Receipt
    from app.models.grade import Student
    from app.models.payment import Payment

    async with async_session_factory() as db:
        year = date.today().year
        month = date.today().month

        engine = BalanceEngine(db)
        await engine.process_rollover(year)
        await db.commit()

        stmt = select(Student).where(Student.is_active == True)  # noqa: E712
        result = await db.execute(stmt)
        students = result.scalars().all()

        statement_service = StatementService(db)
        statements = 0
        for student in students:
            existing = await statement_service.get(student.id, year, month)
            if not existing:
                await statement_service.generate(student.id, year, month)
                statements += 1
        await db.commit()

        receipt_stmt = (
            select(Payment)
            .where(Payment.status == "verified")
            .outerjoin(Receipt, Receipt.payment_id == Payment.id)
            .where(Receipt.id == None)  # noqa: E711
        )
        result = await db.execute(receipt_stmt)
        payments = result.scalars().all()

        receipt_service = ReceiptService(db)
        receipts = 0
        for payment in payments:
            await receipt_service.generate(payment)
            receipts += 1
        await db.commit()

        return {
            "status": "monthly_complete",
            "year": year,
            "month": month,
            "statements": statements,
            "receipts": receipts,
        }


@router.post("/migrate")
async def run_migrations(
    authorized: bool = Depends(_is_authorized),
) -> dict:
    """Run `alembic upgrade head`. Invoke once after each deploy that ships new migrations."""
    _require_authorization(authorized)

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "alembic",
            "upgrade",
            "head",
            cwd=_PROJECT_ROOT,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except TimeoutError:
        proc.kill()
        raise HTTPException(status_code=500, detail="Migration timed out") from None
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Migration failed to start: {exc}") from None

    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Migration failed:\n{stderr.decode()[-2000:]}",
        )

    return {
        "status": "migrations_applied",
        "output": stdout.decode()[-1000:],
        "stderr": stderr.decode()[-1000:],
    }
