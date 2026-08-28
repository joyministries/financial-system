"""Email receipt notifications.

Sends payment-received receipts to the billing parent over SMTP. The channel
is configured (encrypted) through Settings → Email (SMTP) and is completely
optional: when it is not configured, sending simply skips with a log line, so
the payment flow never depends on email being up.
"""

import asyncio
import logging
import smtplib
from datetime import datetime
from decimal import Decimal
from email.message import EmailMessage

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Student, StudentGuardian
from app.models.user import User
from app.services.setting import SettingService

logger = logging.getLogger(__name__)

SCHOOL_NAME = "Lambton School"

_PRIMARY_GUARDIAN_TYPES = ("primary", "father", "mother")


class EmailNotConfiguredError(Exception):
    """Raised when the email channel is disabled or incomplete."""


class EmailService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_config(self) -> dict:
        raw = await SettingService(self.db)._get_raw_checked("email")
        required = ("host", "from_email", "password")
        if not raw.get("enabled") or not all(raw.get(field) for field in required):
            raise EmailNotConfiguredError(
                "Email is not configured. Set SMTP host, From address and password "
                "in Settings → Email (SMTP)."
            )
        return raw

    async def _recipient_email(self, student: Student) -> str | None:
        """Best email address for a student's billing parent:
        the parent account email first, then any guardian with an email."""
        if student.parent_id:
            parent = await self.db.get(User, student.parent_id)
            if parent and parent.email:
                return parent.email

        guardians = (
            student.guardians
            if getattr(student, "guardians", None)
            else await self._load_guardians(student.id)
        )
        sorted_guardians = sorted(
            guardians,
            key=lambda g: (g.guardian_type in _PRIMARY_GUARDIAN_TYPES, g.guardian_type),
            reverse=True,
        )
        for guardian in sorted_guardians:
            if guardian.email:
                return guardian.email
        return None

    async def _load_guardians(self, student_id: str) -> list[StudentGuardian]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(StudentGuardian).where(StudentGuardian.student_id == student_id)
        )
        return list(result.scalars().all())

    async def _recipient_name(self, student: Student) -> str:
        if student.parent_id:
            parent = await self.db.get(User, student.parent_id)
            if parent and parent.full_name:
                return parent.full_name.split(" ", 1)[0]
        return "Parent"

    # ── notifications ─────────────────────────────────────────
    async def send_payment_receipt(
        self,
        student: Student,
        amount: Decimal,
        receipt_number: str,
        payment_date: datetime | None = None,
        created_by: str | None = None,
    ) -> bool:
        """Email the payment-received receipt to the billing parent.

        Returns True when an email was dispatched, False when there was no
        address to send to. Raises EmailNotConfiguredError when the channel
        is off; SMTP errors are logged and re-raised (caller decides).
        """
        config = await self.get_config()
        recipient = await self._recipient_email(student)
        if not recipient:
            logger.info("No email for student %s — skipping receipt email", student.id)
            return False

        name = await self._recipient_name(student)
        subject = f"Receipt {receipt_number} — payment received — {SCHOOL_NAME}"
        date_str = payment_date.strftime("%d %b %Y") if payment_date else ""
        amount_str = f"{amount:,.2f}"

        text = (
            f"Dear {name},\n\n"
            f"We have received your payment of R{amount_str} for {student.first_name} "
            f"{student.last_name}.\n\n"
            f"Receipt number: {receipt_number}\n"
            f"Amount: R{amount_str}\n"
            f"Date: {date_str}\n\n"
            f"Thank you.\n{SCHOOL_NAME} Finance Office"
        )
        html = (
            f"<html><body style='font-family:Arial,sans-serif;color:#1f2937;'>"
            f"<h2 style='color:#1d4ed8;margin-bottom:4px;'>{SCHOOL_NAME}</h2>"
            f"<p style='color:#6b7280;font-size:13px;margin-top:0;'>Payment receipt</p>"
            f"<p>Dear {name},</p>"
            f"<p>We have received your payment of <b>R{amount_str}</b> "
            f"for <b>{student.first_name} {student.last_name}</b>.</p>"
            f"<table cellpadding='6' style='border-collapse:collapse;margin:16px 0;'>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Receipt number</td>"
            f"<td style='border:1px solid #e5e7eb;font-weight:bold;'>{receipt_number}</td></tr>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Amount</td>"
            f"<td style='border:1px solid #e5e7eb;font-weight:bold;'>R{amount_str}</td></tr>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Date</td>"
            f"<td style='border:1px solid #e5e7eb;'>{date_str}</td></tr>"
            f"</table>"
            f"<p>Thank you.</p>"
            f"<p>{SCHOOL_NAME} Finance Office</p>"
            f"</body></html>"
        )

        await self._smtp_send(config, recipient, subject, text, html)
        logger.info("Receipt email %s sent to %s", receipt_number, recipient)
        return True

    # ── SMTP transport ────────────────────────────────────────
    async def _smtp_send(
        self, config: dict, to_email: str, subject: str, text: str, html: str
    ) -> None:
        await asyncio.to_thread(
            self._smtp_send_sync, config, to_email, subject, text, html
        )

    @staticmethod
    def _smtp_send_sync(
        config: dict, to_email: str, subject: str, text: str, html: str
    ) -> None:
        host = config.get("host") or ""
        port = int(config.get("port") or 587)
        username = config.get("username") or ""
        password = config.get("password") or ""
        from_email = config.get("from_email") or ""
        from_name = config.get("from_name") or SCHOOL_NAME

        logger.info(
            "SMTP send: host=%s port=%d from=%s to=%s auth=%s",
            host, port, from_email, to_email, "yes" if username else "no",
        )

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{from_name} <{from_email}>"
        message["To"] = to_email
        message.set_content(text)
        message.add_alternative(html, subtype="html")

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=30)
        else:
            server = smtplib.SMTP(host, port, timeout=30)
            server.ehlo()
            if config.get("use_tls", True):
                server.starttls()
                server.ehlo()

        try:
            if username and password:
                server.login(username, password)
            server.send_message(message)
        finally:
            try:
                server.quit()
            except Exception:
                pass

    async def _smtp_send_batch(
        self,
        config: dict,
        recipients: list[tuple[str, str, str, str, str]],
    ) -> int:
        """Send multiple emails over a single SMTP connection.

        Each tuple is (to_email, subject, text, html). Returns the count
        of successfully sent emails.
        """
        return await asyncio.to_thread(
            self._smtp_send_batch_sync, config, recipients
        )

    @staticmethod
    def _smtp_send_batch_sync(
        config: dict,
        recipients: list[tuple[str, str, str, str, str]],
    ) -> int:
        host = config.get("host") or ""
        port = int(config.get("port") or 587)
        username = config.get("username") or ""
        password = config.get("password") or ""
        from_email = config.get("from_email") or ""
        from_name = config.get("from_name") or SCHOOL_NAME

        logger.info(
            "SMTP batch: host=%s port=%d from=%s recipients=%d",
            host, port, from_email, len(recipients),
        )

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=30)
        else:
            server = smtplib.SMTP(host, port, timeout=30)
            server.ehlo()
            if config.get("use_tls", True):
                server.starttls()
                server.ehlo()

        try:
            if username and password:
                server.login(username, password)

            sent = 0
            for to_email, subject, text, html in recipients:
                try:
                    message = EmailMessage()
                    message["Subject"] = subject
                    message["From"] = f"{from_name} <{from_email}>"
                    message["To"] = to_email
                    message.set_content(text)
                    message.add_alternative(html, subtype="html")
                    server.send_message(message)
                    sent += 1
                except Exception:
                    logger.exception("Failed to send email to %s", to_email)

            return sent
        finally:
            try:
                server.quit()
            except Exception:
                pass


    # ── welcome email ───────────────────────────────────────────
    async def send_welcome_email(self, user: User, student_names: str) -> bool:
        """Send a welcome email to a newly registered parent.

        Returns True when an email was dispatched, False when skipped.
        """
        config = await self.get_config()
        if not user.email:
            return False

        name = user.full_name.split(" ", 1)[0] if user.full_name else "Parent"
        subject = f"Welcome to {SCHOOL_NAME} — registration received"

        text = (
            f"Dear {name},\n\n"
            f"Thank you for registering with {SCHOOL_NAME}.\n\n"
            f"We have received your application for {student_names}. "
            f"Your account is now active and you can log in to the parent portal "
            f"to view fees, make payments and track your child's progress.\n\n"
            f"If you have any questions, please contact the finance office.\n\n"
            f"Kind regards,\n{SCHOOL_NAME}"
        )
        html = (
            f"<html><body style='font-family:Arial,sans-serif;color:#1f2937;'>"
            f"<h2 style='color:#1d4ed8;margin-bottom:4px;'>{SCHOOL_NAME}</h2>"
            f"<p style='color:#6b7280;font-size:13px;margin-top:0;'>Welcome</p>"
            f"<p>Dear {name},</p>"
            f"<p>Thank you for registering with <b>{SCHOOL_NAME}</b>.</p>"
            f"<p>We have received your application for <b>{student_names}</b>. "
            f"Your account is now active and you can log in to the parent portal "
            f"to view fees, make payments and track your child's progress.</p>"
            f"<p>If you have any questions, please contact the finance office.</p>"
            f"<p>Kind regards,<br>{SCHOOL_NAME}</p>"
            f"</body></html>"
        )

        await self._smtp_send(config, user.email, subject, text, html)
        logger.info("Welcome email sent to %s", user.email)
        return True

    async def send_admin_registration_notification(
        self, parent_name: str, parent_email: str, student_names: str
    ) -> bool:
        """Notify all admin/super_admin users about a new parent registration.

        Returns True when emails were dispatched, False when skipped.
        """
        config = await self.get_config()

        from sqlalchemy import select as sa_select

        admins = (
            await self.db.execute(
                sa_select(User).where(
                    User.role.in_(["admin", "super_admin"]),
                    User.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()

        if not admins:
            return False

        subject = f"New parent registration — {parent_name}"
        text = (
            f"A new parent has registered on {SCHOOL_NAME}.\n\n"
            f"Parent: {parent_name} ({parent_email})\n"
            f"Students: {student_names}\n\n"
            f"Please review and approve the application in the admin dashboard."
        )
        html = (
            f"<html><body style='font-family:Arial,sans-serif;color:#1f2937;'>"
            f"<h2 style='color:#1d4ed8;margin-bottom:4px;'>{SCHOOL_NAME}</h2>"
            f"<p style='color:#6b7280;font-size:13px;margin-top:0;'>New registration</p>"
            f"<p>A new parent has registered on {SCHOOL_NAME}.</p>"
            f"<table cellpadding='6' style='border-collapse:collapse;margin:16px 0;'>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Parent</td>"
            f"<td style='border:1px solid #e5e7eb;font-weight:bold;'>{parent_name}</td></tr>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Email</td>"
            f"<td style='border:1px solid #e5e7eb;'>{parent_email}</td></tr>"
            f"<tr><td style='border:1px solid #e5e7eb;color:#6b7280;'>Students</td>"
            f"<td style='border:1px solid #e5e7eb;font-weight:bold;'>{student_names}</td></tr>"
            f"</table>"
            f"<p>Please review and approve the application in the admin dashboard.</p>"
            f"</body></html>"
        )

        recipients = [
            (admin.email, subject, text, html)
            for admin in admins
            if admin.email
        ]

        if not recipients:
            return False

        sent = await self._smtp_send_batch(config, recipients)
        logger.info("Admin registration notification sent to %d admin(s)", sent)
        return sent > 0

    # ── test email ─────────────────────────────────────────────
    async def send_test_email(self, to_email: str) -> None:
        """Send a fixed test message to verify the SMTP channel end-to-end."""
        config = await self.get_config()
        subject = f"Test email — {SCHOOL_NAME}"
        text = (
            f"Hello,\n\n"
            f"This is a test email from {SCHOOL_NAME}.\n\n"
            f"If you received this, the email channel is working correctly.\n\n"
            f"{SCHOOL_NAME} Finance Office"
        )
        html = (
            f"<html><body style='font-family:Arial,sans-serif;color:#1f2937;'>"
            f"<h2 style='color:#1d4ed8;margin-bottom:4px;'>{SCHOOL_NAME}</h2>"
            f"<p style='color:#6b7280;font-size:13px;margin-top:0;'>Test email</p>"
            f"<p>Hello,</p>"
            f"<p>This is a test email from <b>{SCHOOL_NAME}</b>.</p>"
            f"<p>If you received this, the email channel is working correctly.</p>"
            f"<p>{SCHOOL_NAME} Finance Office</p>"
            f"</body></html>"
        )
        await self._smtp_send(config, to_email, subject, text, html)
        logger.info("Test email sent to %s", to_email)


async def send_payment_receipt_email_async(
    student_id: str,
    amount: Decimal,
    receipt_number: str,
    payment_date: datetime | None = None,
) -> None:
    """Open a fresh session and fire the receipt email. Used from background
    tasks so the HTTP request is never blocked by SMTP."""
    from app.core.database import async_session_factory

    try:
        async with async_session_factory() as db:
            student = await db.get(Student, student_id)
            if not student:
                logger.warning("Receipt email: student %s not found", student_id)
                return
            await EmailService(db).send_payment_receipt(
                student, amount, receipt_number, payment_date=payment_date
            )
            await db.commit()
    except EmailNotConfiguredError:
        logger.info("Receipt email skipped — email channel not configured")
    except Exception:  # noqa: BLE001
        logger.exception("Receipt email failed for student %s", student_id)
