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
    """Collect parents with outstanding balances for notification dispatch."""
    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.grade import Student
    from app.models.schedule import OutstandingBalance

    async def _run():
        async with async_session_factory() as db:
            stmt = (
                select(OutstandingBalance)
                .join(Student, Student.id == OutstandingBalance.student_id)
                .where(
                    OutstandingBalance.status != "paid",
                    Student.is_active == True,  # noqa: E712
                )
            )
            result = await db.execute(stmt)
            balances = result.scalars().all()

            reminders = []
            for balance in balances:
                student = await db.get(Student, balance.student_id)
                if student:
                    reminders.append({
                        "student_id": student.id,
                        "parent_id": student.parent_id,
                        "balance": float(balance.balance),
                    })

            return reminders

    reminders = asyncio.run(_run())
    # Wire up to notification service when ready
    return {"status": "reminders_queued", "count": len(reminders)}


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
