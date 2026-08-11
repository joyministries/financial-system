"""Automated payment-link reminder engine.

Generates a secure PayFast pay-by-link per student (exactly the same shape as
the parent-facing "Pay Online" flow) and SMSes the link to the billing parent,
so each parent receives a payment link for only what they owe.

The schedule is admin-configured (Settings -> Notifications -> Payment Link
Reminders) and driven by a daily Celery beat task that fires reminder N on
start_date + (N-1) * interval_days.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.grade import Student
from app.models.schedule import OutstandingBalance
from app.schemas.payment import PaymentCreate
from app.services.payment import PaymentService
from app.services.sms import SmsNotConfiguredError, SmsService

logger = logging.getLogger(__name__)

# Reference prefix marks payments created by the reminder engine in reports.
# PayFast reconciliation uses m_payment_id regardless, so these behave exactly
# like payments initiated from the parent dashboard.
REMINDER_REFERENCE_PREFIX = "PF-RM"


# ── queries ──────────────────────────────────────────────────
async def get_due_students(db: AsyncSession) -> list[Student]:
    """Active students with at least one unpaid outstanding balance."""
    stmt = (
        select(Student)
        .join(OutstandingBalance, OutstandingBalance.student_id == Student.id)
        .where(
            Student.is_active == True,  # noqa: E712
            OutstandingBalance.status != "paid",
        )
        .distinct()
        .order_by(Student.first_name, Student.last_name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def outstanding_total(db: AsyncSession, student_id: str) -> Decimal:
    """Total current outstanding balance for one student."""
    stmt = select(OutstandingBalance).where(
        OutstandingBalance.student_id == student_id,
        OutstandingBalance.status != "paid",
    )
    rows = (await db.execute(stmt)).scalars().all()
    return sum((row.balance or Decimal("0")) for row in rows)


# ── link generation ──────────────────────────────────────────
async def create_payment_link(
    db: AsyncSession,
    student: Student,
    amount: Decimal,
    reference_prefix: str = REMINDER_REFERENCE_PREFIX,
    notes: str = "Automated SMS payment-link reminder",
) -> str:
    """Create a pending PayFast payment and return its shareable pay URL.

    Mirrors POST /payfast/initiate but requires no login — the payment id
    (a UUID) is the capability token scoped to this single payment.
    """
    payment = await PaymentService(db).record_payment(
        PaymentCreate(
            student_id=student.id,
            amount=amount,
            payment_method="payfast",
            payment_date=datetime.now(UTC),
            reference_number=f"{reference_prefix}-{student.id[:8].upper()}",
            notes=notes,
        ),
        user_id=student.parent_id,
    )
    await db.flush()
    from app.services.setting import SettingService

    settings = get_settings()
    link_base = await SettingService(db).get_plain("payfast_base_url") or settings.PAYFAST_BASE_URL
    code = payment.pay_code or payment.id[:10]
    return f"{link_base.rstrip('/')}/pay/{code}"


# ── send ─────────────────────────────────────────────────────
async def send_payment_link_reminders(
    db: AsyncSession,
    created_by: str | None = None,
) -> dict:
    """Send one payment-link SMS to every due student's billing parent.

    Returns {"sent", "skipped_no_phone", "skipped_failed", "errors"}.
    Raises SmsNotConfiguredError when the SMS channel is disabled so callers
    can abort the scheduled run gracefully.
    """
    service = SmsService(db)
    students = await get_due_students(db)
    if not students:
        return {"sent": 0, "skipped_no_phone": 0, "skipped_failed": 0, "errors": []}

    sent = 0
    skipped_no_phone = 0
    errors: list[str] = []
    for student in students:
        amount = await outstanding_total(db, student.id)
        if amount <= 0:
            continue
        link = await create_payment_link(db, student, amount)
        try:
            message = await service.send_payment_link(student, amount, link, created_by=created_by)
            if message:
                sent += 1
            else:
                skipped_no_phone += 1
        except (SmsNotConfiguredError, ValueError):
            # Channel disabled or invalid number — abort the run; the caller
            # decides whether to surface it as an error.
            raise
        except Exception as exc:  # noqa: BLE001 — provider failure for one student
            logger.warning("Reminder SMS failed for %s: %s", student.student_number, exc)
            errors.append(f"{student.student_number}: {exc}")

    await db.commit()
    return {
        "sent": sent,
        "skipped_no_phone": skipped_no_phone,
        "skipped_failed": len(errors),
        "errors": errors[:20],
    }


# ── schedule ─────────────────────────────────────────────────
def due_reminder_index(config: dict, today: date | None = None) -> int | None:
    """0-based reminder index due today, or None when nothing fires.

    Reminder N (1-based) fires on start_date + (N-1) * interval_days.
    """
    today = today or date.today()
    if not config.get("enabled"):
        return None
    start_raw = (config.get("start_date") or "").strip()
    if not start_raw:
        return None
    try:
        start = date.fromisoformat(start_raw)
    except ValueError:
        return None
    if today < start:
        return None
    delta = (today - start).days
    interval = max(1, int(config.get("interval_days") or 7))
    count = max(1, int(config.get("count") or 1))
    if delta % interval != 0:
        return None
    idx = delta // interval
    if idx >= count:
        return None
    return idx


def next_run_date(config: dict, today: date | None = None) -> date | None:
    """The next date a reminder will fire, if the schedule is enabled."""
    today = today or date.today()
    if not config.get("enabled"):
        return None
    start_raw = (config.get("start_date") or "").strip()
    if not start_raw:
        return None
    try:
        start = date.fromisoformat(start_raw)
    except ValueError:
        return None
    interval = max(1, int(config.get("interval_days") or 7))
    count = max(1, int(config.get("count") or 1))
    # Walk forward from start in interval steps until we pass today.
    candidate = start
    for _ in range(count):
        if candidate >= today:
            return candidate
        candidate = candidate + timedelta(days=interval)
    return None
