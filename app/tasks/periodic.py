import asyncio

from app.tasks import celery_app


@celery_app.task(name="tasks.process_monthly_rollover")
def process_monthly_rollover(academic_year: int) -> dict:
    """Roll unpaid balances into the next month's outstanding amount."""
    from app.core.database import async_session_factory
    from app.services.balance import BalanceEngine

    async def _run():
        async with async_session_factory() as db:
            engine = BalanceEngine(db)
            await engine.process_rollover(academic_year)
            await db.commit()

    asyncio.run(_run())
    return {"status": "rollover_complete", "academic_year": academic_year}


@celery_app.task(name="tasks.generate_monthly_statements")
def generate_monthly_statements(academic_year: int, month: int) -> dict:
    """Generate statements for all active students who don't already have one."""
    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.grade import Student
    from app.services.statement import StatementService

    async def _run():
        async with async_session_factory() as db:
            stmt = select(Student).where(Student.is_active == True)  # noqa: E712
            result = await db.execute(stmt)
            students = result.scalars().all()

            service = StatementService(db)
            count = 0
            for student in students:
                existing = await service.get(student.id, academic_year, month)
                if not existing:
                    await service.generate(student.id, academic_year, month)
                    count += 1

            await db.commit()
            return count

    count = asyncio.run(_run())
    return {
        "status": "statements_generated",
        "academic_year": academic_year,
        "month": month,
        "count": count,
    }


@celery_app.task(name="tasks.send_fee_reminders")
def send_fee_reminders(academic_year: int, month: int) -> dict:
    """SMS every parent with an outstanding balance for the given month.

    One SMS per student, to the billing parent's mobile. Students without a
    usable guardian phone are counted and reported. The SMS channel must be
    configured (Settings → Notifications) — otherwise the run is skipped
    gracefully and reported.
    """
    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.grade import Student
    from app.models.schedule import OutstandingBalance
    from app.services.sms import SmsNotConfiguredError, SmsService

    async def _run():
        async with async_session_factory() as db:
            stmt = (
                select(Student)
                .join(OutstandingBalance, OutstandingBalance.student_id == Student.id)
                .where(
                    OutstandingBalance.status != "paid",
                    Student.is_active == True,  # noqa: E712
                )
                .distinct()
            )
            result = await db.execute(stmt)
            students = result.scalars().all()

            if not students:
                return {"sent": 0, "skipped_no_phone": 0, "failed": 0, "errors": []}

            service = SmsService(db)
            sent = 0
            skipped_no_phone = 0
            errors: list[str] = []

            for student in students:
                balance_stmt = select(OutstandingBalance).where(
                    OutstandingBalance.student_id == student.id,
                    OutstandingBalance.status != "paid",
                )
                rows = (await db.execute(balance_stmt)).scalars().all()
                total = sum((row.balance or 0) for row in rows)
                try:
                    message = await service.send_balance_reminder(
                        student, total, month, academic_year
                    )
                    if message:
                        sent += 1
                    else:
                        skipped_no_phone += 1
                except SmsNotConfiguredError:
                    # Channel not configured — nothing to send; abort the run.
                    return {
                        "error": "SMS channel not configured",
                        "sent": sent,
                        "skipped_no_phone": skipped_no_phone,
                        "failed": len(errors),
                        "errors": errors,
                    }
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{student.student_number}: {exc}")

            await db.commit()
            return {
                "sent": sent,
                "skipped_no_phone": skipped_no_phone,
                "failed": len(errors),
                "errors": errors[:20],
            }

    return asyncio.run(_run())


@celery_app.task(name="tasks.generate_receipts_batch")
def generate_receipts_batch() -> dict:
    """Create receipts for verified payments that are missing one."""
    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.financial import Receipt
    from app.models.payment import Payment
    from app.services.receipt import ReceiptService

    async def _run():
        async with async_session_factory() as db:
            stmt = (
                select(Payment)
                .where(Payment.status == "verified")
                .outerjoin(Receipt, Receipt.payment_id == Payment.id)
                .where(Receipt.id == None)  # noqa: E711
            )
            result = await db.execute(stmt)
            payments = result.scalars().all()

            service = ReceiptService(db)
            count = 0
            for payment in payments:
                await service.generate(payment)
                count += 1

            await db.commit()
            return count

    count = asyncio.run(_run())
    return {"status": "receipts_generated", "count": count}


@celery_app.task(name="tasks.run_reminder_scheduler")
def run_reminder_scheduler() -> dict:
    """Daily beat task: fire the configured payment-link reminder when due.

    Reminder N (1-based) fires on start_date + (N-1) * interval_days.
    Runs are idempotent per day (last_run_date guard) and skip cleanly when
    the channel or schedule is not configured.
    """
    from datetime import date

    from app.core.database import async_session_factory
    from app.services.reminder import due_reminder_index, send_payment_link_reminders
    from app.services.setting import SettingService
    from app.services.sms import SmsNotConfiguredError

    async def _run():
        async with async_session_factory() as db:
            settings_service = SettingService(db)
            config = await settings_service.get_reminder_config()
            if not config.get("enabled"):
                return {"status": "skipped_disabled"}

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

            await settings_service.record_reminder_run(idx + 1)
            await db.commit()
            return {"status": "sent", "reminder": idx + 1, **result}

    return asyncio.run(_run())
