import asyncio

from app.tasks import celery_app

# Portal URL used in the statement-ready SMS when the admin has not stored a
# `frontend_base_url` (Settings → Base URLs). Mirrors the deployed frontend.
DEFAULT_PORTAL_BASE_URL = "https://financial-system-flax.vercel.app"


def _run_task(coro):
    """Run a task coroutine on its own loop, then dispose the pooled engine.

    Celery workers are long-lived, but every task call builds a fresh event loop
    via ``asyncio.run()``. The process-wide async engine keeps pooled
    connections bound to the loop that opened them, so a *second* task handled
    by the same worker would check a connection out of an already-closed loop
    and die with "got Future attached to a different loop". Disposing the pool
    after each run lets the daily reminder / auto-generation / statement
    schedulers coexist in one worker instead of only the first one succeeding.
    """
    from app.core.database import engine

    async def _wrapped():
        try:
            return await coro
        finally:
            await engine.dispose()

    return asyncio.run(_wrapped())


@celery_app.task(name="tasks.process_monthly_rollover")
def process_monthly_rollover(academic_year: int) -> dict:
    """Monthly close (legacy name).

    Balances are derived from the Excel-aligned ledger (invoices minus
    verified payments), so there is nothing to roll over — this task reports
    the school-wide outstanding position instead of writing schedule rows.
    """
    from app.core.database import async_session_factory
    from app.services.ledger import LedgerService

    async def _run():
        async with async_session_factory() as db:
            ledger = LedgerService(db)
            rows = await ledger.students_outstanding(academic_year)
            total_required = sum((r["required"] for r in rows), 0)
            total_paid = sum((r["paid"] for r in rows), 0)
            total_outstanding = sum((r["outstanding"] for r in rows), 0)
            students_outstanding = sum(1 for r in rows if r["outstanding"] > 0)
            return {
                "academic_year": academic_year,
                "total_required": str(total_required),
                "total_paid": str(total_paid),
                "total_outstanding": str(total_outstanding),
                "students_outstanding": students_outstanding,
            }

    result = _run_task(_run())
    return {"status": "rollover_noop_ledger_aligned", **result}


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

    count = _run_task(_run())
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
    from app.core.database import async_session_factory
    from app.models.grade import Student
    from app.services.ledger import LedgerService
    from app.services.sms import SmsNotConfiguredError, SmsService

    async def _run():
        async with async_session_factory() as db:
            ledger = LedgerService(db)
            ledger_rows = await ledger.students_outstanding(academic_year)
            students = []
            for row in ledger_rows:
                if row["outstanding"] <= 0:
                    continue
                student = await db.get(Student, row["student_id"])
                if student and student.is_active:
                    students.append((student, row["outstanding"]))

            if not students:
                return {"sent": 0, "skipped_no_phone": 0, "failed": 0, "errors": []}

            service = SmsService(db)
            sent = 0
            skipped_no_phone = 0
            errors: list[str] = []

            for student, total in students:
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

    return _run_task(_run())


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

    count = _run_task(_run())
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

    return _run_task(_run())


@celery_app.task(name="tasks.run_auto_generation_scheduler")
def run_auto_generation_scheduler() -> dict:
    """Daily beat task: generate the month's invoices, then its statements.

    Fires once the admin-configured day of month arrives and this calendar
    month has not run yet. Invoices go out first for every approved student;
    existing invoices are skipped and parent SMS only fires for invoices the
    round actually created, so a repeat run is harmless. Statements are
    generated accumulatively from month 1 once every invoice round reports
    ``complete``.

    The run is recorded only after both halves succeed — an interrupted month
    is retried on the next beat until it finishes, rather than silently
    skipped for the rest of the month.
    """
    from datetime import date

    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.user import User
    from app.services.invoice import InvoiceService
    from app.services.notification import NotificationService
    from app.services.setting import SettingService
    from app.services.statement import bulk_generate_statements

    # generate_all self-limits to ~45s per round; a few rounds cover a whole
    # school that outlives the first budget without ever duplicating work.
    max_invoice_rounds = 10

    async def _run():
        async with async_session_factory() as db:
            settings_service = SettingService(db)
            config = await settings_service.get_auto_generation_config()
            if not config.get("enabled"):
                return {"status": "skipped_disabled"}

            today = date.today()
            day = max(1, min(28, int(config.get("day_of_month") or 1)))
            ran_this_month = (config.get("last_run_date") or "")[:7] == today.strftime("%Y-%m")
            if ran_this_month:
                return {"status": "already_fired_this_month"}
            if today.day < day:
                return {"status": "not_due", "day_of_month": day}

            actor_id = (
                await db.execute(
                    select(User.id)
                    .where(User.role.in_(["admin", "finance", "super_admin"]))
                    .order_by(User.created_at)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if actor_id is None:
                return {
                    "status": "error",
                    "error": "No admin/finance user to attribute the run to",
                }

            academic_year = today.year
            month = today.month
            notify_parents = bool(config.get("notify_parents", True))

            invoice_service = InvoiceService(db)
            created = skipped = failed = 0
            errors: list[str] = []
            complete = False
            for _ in range(max_invoice_rounds):
                result = await invoice_service.generate_all(
                    academic_year,
                    month,
                    actor_id,
                    grade_id=None,
                    notify_parents=notify_parents,
                )
                created += result.get("generated", 0)
                skipped += result.get("skipped", 0)
                failed += result.get("failed", 0)
                errors.extend(result.get("errors") or [])
                if result.get("complete"):
                    complete = True
                    break

            if not complete:
                # Nothing recorded: the next beat resumes, invoices skip.
                return {
                    "status": "invoices_incomplete",
                    "academic_year": academic_year,
                    "month": month,
                    "generated": created,
                    "skipped": skipped,
                }

            statements = await bulk_generate_statements(db, academic_year, month)
            await settings_service.record_auto_generation_run()
            await db.commit()

            await NotificationService(db).notify_staff(
                title="Scheduled invoice + statement generation complete",
                message=(
                    f"{academic_year}-{month:02d}: {created} invoices created, "
                    f"{skipped} already existed"
                    f"{f', {failed} failed' if failed else ''}; "
                    f"{statements.get('generated', 0)} statements created."
                ),
                category="system",
            )
            await db.commit()

            return {
                "status": "generated",
                "academic_year": academic_year,
                "month": month,
                "generated_invoices": created,
                "skipped_invoices": skipped,
                "failed_invoices": failed,
                "generated_statements": statements.get("generated", 0),
                "errors": errors[:20],
            }

    return _run_task(_run())


@celery_app.task(name="tasks.run_statement_generation_scheduler")
def run_statement_generation_scheduler() -> dict:
    """Daily beat task: generate the month's statements and notify parents.

    Fires once the admin-configured day of month arrives and this calendar
    month has not run yet. Statements are generated accumulatively from month
    1 (``bulk_generate_statements`` skips rows that already exist, so a repeat
    run — or an overlapping invoice auto-generation run — never duplicates
    them). When ``notify_parents`` is on, each billed student's parent gets an
    SMS linking to the portal and an in-app notification.

    The run is recorded only after the statement round succeeds, so a beat that
    was down on the configured day is retried the next day rather than being
    skipped for the whole month.
    """
    from calendar import month_name
    from datetime import date

    from sqlalchemy import select

    from app.core.database import async_session_factory
    from app.models.grade import Student
    from app.models.user import User
    from app.services.notification import NotificationService
    from app.services.setting import SettingService
    from app.services.sms import SmsNotConfiguredError, SmsService
    from app.services.statement import bulk_generate_statements

    async def _run():
        async with async_session_factory() as db:
            settings_service = SettingService(db)
            config = await settings_service.get_statement_generation_config()
            if not config.get("enabled"):
                return {"status": "skipped_disabled"}

            today = date.today()
            day = max(1, min(28, int(config.get("day_of_month") or 1)))
            ran_this_month = (config.get("last_run_date") or "")[:7] == today.strftime("%Y-%m")
            if ran_this_month:
                return {"status": "already_fired_this_month"}
            if today.day < day:
                return {"status": "not_due", "day_of_month": day}

            actor_id = (
                await db.execute(
                    select(User.id)
                    .where(User.role.in_(["admin", "finance", "super_admin"]))
                    .order_by(User.created_at)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if actor_id is None:
                return {
                    "status": "error",
                    "error": "No admin/finance user to attribute the run to",
                }

            academic_year = today.year
            month = today.month
            month_label = month_name[month]

            statements = await bulk_generate_statements(db, academic_year, month)
            await settings_service.record_statement_generation_run()
            await db.commit()

            notify_parents = bool(config.get("notify_parents", True))
            sms_sent = sms_skipped = in_app = 0
            sms_error: str | None = None

            if notify_parents:
                base_url = (
                    await settings_service.get_plain("frontend_base_url")
                ).rstrip("/") or DEFAULT_PORTAL_BASE_URL
                link = f"{base_url}/statements"

                students = (
                    await db.execute(
                        select(Student).where(Student.registration_status == "approved")
                    )
                ).scalars().all()

                sms_service = SmsService(db)
                notifications = NotificationService(db)
                seen_parents: set[str] = set()

                for student in students:
                    try:
                        message = await sms_service.send_statement_ready(
                            student, month, academic_year, link, created_by=actor_id
                        )
                        if message:
                            sms_sent += 1
                        else:
                            sms_skipped += 1
                    except SmsNotConfiguredError:
                        # Channel not configured — stop SMS but still fan out
                        # the in-app notification so the run is not a no-op.
                        sms_error = "SMS channel not configured"
                        break
                    except Exception as exc:  # noqa: BLE001 - one student must not abort the run
                        sms_error = f"{type(exc).__name__}: {exc}"

                    if student.parent_id and student.parent_id not in seen_parents:
                        seen_parents.add(student.parent_id)
                        await notifications.notify_user(
                            user_id=student.parent_id,
                            title=f"{student.first_name}'s statement is ready",
                            message=(
                                f"{student.first_name} {student.last_name}'s "
                                f"{month_label} {academic_year} fee statement is ready "
                                f"to view in the portal."
                            ),
                            category="system",
                            entity_type="student",
                            entity_id=student.id,
                        )
                        in_app += 1

                await db.commit()

            failed_note = (
                f", {statements.get('failed', 0)} failed" if statements.get("failed") else ""
            )
            sms_note = f" ({sms_error})" if sms_error else ""
            await NotificationService(db).notify_staff(
                title="Scheduled statement generation complete",
                message=(
                    f"{academic_year}-{month:02d}: {statements.get('generated', 0)} statements "
                    f"created, {statements.get('skipped', 0)} already existed{failed_note}; "
                    f"{sms_sent} parent SMS, {in_app} in-app notifications{sms_note}."
                ),
                category="system",
            )
            await db.commit()

            return {
                "status": "generated",
                "academic_year": academic_year,
                "month": month,
                "generated_statements": statements.get("generated", 0),
                "skipped_statements": statements.get("skipped", 0),
                "failed_statements": statements.get("failed", 0),
                "notify_parents": notify_parents,
                "sms_sent": sms_sent,
                "sms_skipped_no_phone": sms_skipped,
                "in_app_notified": in_app,
                "sms_error": sms_error,
                "errors": (statements.get("errors") or [])[:20],
            }

    return _run_task(_run())
