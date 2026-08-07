import json
import logging
import re
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Student, StudentGuardian
from app.models.sms import SmsMessage
from app.services.setting import SettingService

logger = logging.getLogger(__name__)

# SMSportal (LINK Mobility) REST API — https://docs.smsportal.com
SMS_PORTAL_BASE_URL = "https://rest.smsportal.com"
SMS_PORTAL_SEND_PATH = "/v3/BulkMessages"
SMS_PORTAL_TIMEOUT = 15.0

# Guardian roles that identify the billing parent for a child.
_PRIMARY_GUARDIAN_TYPES = ("primary", "father", "mother")

MSG_PAYMENT_RECEIVED = (
    "Lambton Christian School: Dear {parent}, we have received your payment of "
    "R{amount} for {student}. Receipt {receipt}. Thank you."
)
MSG_BALANCE_REMINDER = (
    "Lambton Christian School: {student}'s outstanding balance is R{balance} "
    "as of {month}/{year}. Please settle the balance to keep the account "
    "in good standing. Contact the office with any queries."
)
MSG_PAYMENT_LINK = (
    "Lambton Christian School: Dear {parent}, please pay R{amount} for "
    "{student}'s school fees: {link}"
)
MSG_TEST = "Lambton Christian School: This is a test SMS. If you received this, SMS is working."


class SmsNotConfiguredError(Exception):
    """SMS channel is disabled or missing provider credentials."""


class SmsService:
    """Sends SMS via SMSportal and records every attempt in `sms_messages`.

    Every send creates a row (status `queued`) BEFORE the provider call, so
    failures are always visible in the log. The channel is configured in
    Settings → Notifications (encrypted at rest via SettingService).
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── configuration ─────────────────────────────────────────
    async def get_config(self) -> dict:
        """Decrypted, validated SMS channel config (provider + secrets)."""
        raw = await SettingService(self.db)._get_raw_checked("sms")
        enabled = bool(raw.get("enabled"))
        provider = (raw.get("provider") or "").strip().lower()
        api_key = raw.get("api_key") or ""
        api_secret = raw.get("api_secret") or ""

        if not enabled:
            raise SmsNotConfiguredError("SMS is disabled in Settings → Notifications")
        if provider != "smsportal":
            raise SmsNotConfiguredError(
                f"Built-in SMS client only supports 'smsportal', got provider={provider!r}"
            )
        if not api_key:
            raise SmsNotConfiguredError(
                "SMSportal Client ID (api_key) is not configured. "
                "Generate one in the SMSportal Control Panel → API Keys."
            )
        return {
            "enabled": enabled,
            "provider": provider,
            "api_key": api_key,
            "api_secret": api_secret,
            "sender_id": (raw.get("sender_id") or "Lambton")[:11],
        }

    @staticmethod
    def normalize_number(phone: str | None) -> str | None:
        """Normalize a SA mobile number to E.164 (27xxxxxxxxx). Returns None
        when the number is missing or unrecognised."""
        if not phone:
            return None
        digits = re.sub(r"\D", "", phone)
        if len(digits) == 9 and digits.startswith(("6", "7", "8")):
            return "27" + digits
        if len(digits) == 10 and digits.startswith("0"):
            return "27" + digits[1:]
        if len(digits) == 11 and digits.startswith("27"):
            return digits
        return None

    # ── recipient lookup ──────────────────────────────────────
    async def get_student_phone(self, student: Student) -> str | None:
        """Best available mobile number for a student's billing parent:
        primary guardian first, then any guardian with a phone."""
        guardians = (
            student.guardians
            if getattr(student, "guardians", None)
            else await self._load_guardians(student.id)
        )
        if not guardians:
            return None

        sorted_guardians = sorted(
            guardians,
            key=lambda g: (g.guardian_type in _PRIMARY_GUARDIAN_TYPES, g.guardian_type),
            reverse=True,
        )
        for guardian in sorted_guardians:
            normalized = self.normalize_number(guardian.phone)
            if normalized:
                return normalized
        return None

    async def _load_guardians(self, student_id: str) -> list[StudentGuardian]:
        stmt = select(StudentGuardian).where(StudentGuardian.student_id == student_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── send ──────────────────────────────────────────────────
    async def send(
        self,
        to_phone: str,
        content: str,
        student_id: str | None = None,
        template: str = "manual",
        created_by: str | None = None,
    ) -> SmsMessage:
        """Send one SMS and record the outcome. Raises SmsNotConfiguredError
        when the channel is disabled/misconfigured; provider failures are
        captured on the message row and re-raised as RuntimeError."""
        normalized = self.normalize_number(to_phone)
        if not normalized:
            raise ValueError(f"Unrecognised SA mobile number: {to_phone!r}")

        config = await self.get_config()

        message = SmsMessage(
            student_id=student_id,
            to_phone=normalized,
            content=content[:1600],
            template=template,
            status="queued",
            provider="smsportal",
            created_by=created_by,
        )
        self.db.add(message)
        await self.db.flush()

        try:
            result = await self._call_smsportal(config, normalized, message.content)
        except Exception as exc:  # noqa: BLE001 — capture any provider failure
            message.status = "failed"
            message.error = str(exc)[:2000]
            await self.db.flush()
            logger.warning("SMS failed to %s: %s", normalized, exc)
            raise RuntimeError(f"SMS send failed: {exc}") from exc

        message.status = result["status"]
        message.provider_message_id = result.get("message_id")
        message.provider_status = result.get("provider_status")
        message.cost = result.get("cost")
        message.error = result.get("error")
        await self.db.flush()
        return message

    async def _call_smsportal(self, config: dict, destination: str, content: str) -> dict:
        """POST to SMSportal /v3/BulkMessages with Basic auth."""
        import base64

        credentials = base64.b64encode(
            f"{config['api_key']}:{config['api_secret']}".encode()
        ).decode()

        payload = {
            "sendOptions": {
                "senderId": config["sender_id"],
                "testMode": False,
                "checkOptOuts": True,  # POPIA/WASPA: never SMS opted-out numbers
            },
            "messages": [
                {"content": content, "destination": destination, "customerId": destination}
            ],
        }

        async with httpx.AsyncClient(
            base_url=SMS_PORTAL_BASE_URL, timeout=SMS_PORTAL_TIMEOUT
        ) as client:
            response = await client.post(
                SMS_PORTAL_SEND_PATH,
                headers={"Authorization": f"Basic {credentials}"},
                json=payload,
            )

        if response.status_code in (200, 201):
            data = response.json()
            send_response = data.get("sendResponse") or {}
            error_report = send_response.get("errorReport") or {}
            faults = error_report.get("faults") or []
            message_count = send_response.get("messages") or 0
            accepted = (
                data.get("statusCode") == 200
                and message_count > 0
                and not faults
                and not error_report.get("noNetwork")
                and not error_report.get("noContents")
            )
            return {
                "status": "sent" if accepted else "failed",
                "message_id": (
                    str(send_response["eventId"]) if send_response.get("eventId") else None
                ),
                "provider_status": "sent" if accepted else "rejected",
                "cost": _to_decimal(send_response.get("cost")),
                "error": (json.dumps(faults, default=str)[:2000] if faults else None),
            }

        raise RuntimeError(f"SMSportal HTTP {response.status_code}: {response.text[:300]}")

    # ── templates / notifications ─────────────────────────────
    async def notify_payment_verified(
        self,
        student: Student,
        amount: Decimal,
        receipt_number: str,
        created_by: str | None = None,
    ) -> SmsMessage | None:
        """Send the payment-received receipt SMS to the billing parent."""
        phone = await self.get_student_phone(student)
        if not phone:
            logger.info("No guardian phone for student %s — skipping receipt SMS", student.id)
            return None
        # Greet the parent by their account first name when we have one.
        parent_name = "Parent"
        if student.parent_id:
            from app.models.user import User

            parent_user = await self.db.get(User, student.parent_id)
            if parent_user and parent_user.full_name:
                parent_name = parent_user.full_name.split(" ", 1)[0]
        content = MSG_PAYMENT_RECEIVED.format(
            amount=f"{amount:,.2f}",
            parent=parent_name,
            student=student.first_name,
            receipt=receipt_number,
        )
        return await self.send(
            phone,
            content,
            student_id=student.id,
            template="payment_receipt",
            created_by=created_by,
        )

    async def send_balance_reminder(
        self, student: Student, balance: Decimal, month: int, year: int
    ) -> SmsMessage | None:
        phone = await self.get_student_phone(student)
        if not phone:
            return None
        content = MSG_BALANCE_REMINDER.format(
            student=student.first_name,
            balance=f"{balance:,.2f}",
            month=f"{month:02d}",
            year=year,
        )
        return await self.send(phone, content, student_id=student.id, template="balance_reminder")

    async def send_payment_link(
        self,
        student: Student,
        amount: Decimal,
        link: str,
        created_by: str | None = None,
    ) -> SmsMessage | None:
        """Send the parent a secure pay-by-link SMS for a pending payment."""
        phone = await self.get_student_phone(student)
        if not phone:
            return None
        parent_name = "Parent"
        if student.parent_id:
            from app.models.user import User

            parent_user = await self.db.get(User, student.parent_id)
            if parent_user and parent_user.full_name:
                parent_name = parent_user.full_name.split(" ", 1)[0]
        content = MSG_PAYMENT_LINK.format(
            parent=parent_name,
            amount=f"{amount:,.2f}",
            student=student.first_name,
            link=link,
        )
        return await self.send(
            phone,
            content,
            student_id=student.id,
            template="payment_link",
            created_by=created_by,
        )

    async def send_test(self, to_phone: str, created_by: str | None = None) -> SmsMessage:
        return await self.send(to_phone, MSG_TEST, template="test", created_by=created_by)

    # ── log ───────────────────────────────────────────────────
    async def list_log(
        self, limit: int = 50, offset: int = 0, status: str | None = None
    ) -> list[SmsMessage]:
        stmt = (
            select(SmsMessage)
            .order_by(SmsMessage.created_at.desc())
            .offset(offset)
            .limit(min(limit, 200))
        )
        if status:
            stmt = stmt.where(SmsMessage.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count(self) -> int:
        from sqlalchemy import func

        result = await self.db.execute(select(func.count()).select_from(SmsMessage))
        return result.scalar_one()


def _to_decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return None


# ── background helper ─────────────────────────────────────────
def sms_recipient_phone(student: Student, guardians: list[StudentGuardian]) -> str | None:
    """Sync helper: pick the best guardian phone without an extra query."""
    for guardian in sorted(
        guardians,
        key=lambda g: (g.guardian_type in _PRIMARY_GUARDIAN_TYPES, g.guardian_type),
        reverse=True,
    ):
        normalized = SmsService.normalize_number(guardian.phone)
        if normalized:
            return normalized
    return None


async def send_payment_receipt_sms_async(
    student_id: str, amount: Decimal, receipt_number: str
) -> None:
    """Open a fresh session and fire the receipt SMS. Used from background
    tasks / Celery so the HTTP request is never blocked by the provider."""
    from app.core.database import async_session_factory

    try:
        async with async_session_factory() as db:
            student = await db.get(Student, student_id)
            if not student:
                logger.warning("Receipt SMS: student %s not found", student_id)
                return
            await SmsService(db).notify_payment_verified(student, amount, receipt_number)
            await db.commit()
    except SmsNotConfiguredError:
        logger.info("Receipt SMS skipped — SMS channel not configured")
    except Exception:  # noqa: BLE001
        logger.exception("Receipt SMS failed for student %s", student_id)
