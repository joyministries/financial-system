import base64
import hashlib
import json

from cryptography.fernet import Fernet
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.setting import SystemSetting
from app.schemas.setting import (
    EmailSettingsIn,
    EmailSettingsOut,
    NotificationSettingsOut,
    ReminderSettingsIn,
    SmsSettingsIn,
    SmsSettingsOut,
)
from app.services.audit import AuditService

settings = get_settings()

# Sentinel the UI sends for a secret it did not touch. We keep the stored value.
KEEP_SECRET = "********"


class SettingService:
    """Notification-channel configuration (email/SMS).

    Secrets are encrypted at rest with Fernet. The encryption key is derived
    deterministically from JWT_SECRET_KEY (sha256 → url-safe base64), so no
    extra environment variable is required. For higher assurance, swap this
    derivation for a dedicated SECRETS_ENCRYPTION_KEY env var before production.
    """

    SECRET_FIELDS: dict[str, set[str]] = {
        "email": {"password"},
        "sms": {"api_key", "api_secret"},
    }

    # Non-secret defaults for a channel with no stored row yet.
    DEFAULTS: dict[str, dict] = {
        "email": {
            "enabled": False,
            "host": "",
            "port": 587,
            "username": "",
            "from_email": "",
            "from_name": "",
            "use_tls": True,
        },
        "sms": {
            "enabled": False,
            "provider": "",
            "sender_id": "",
        },
        "reminders": {
            "enabled": False,
            "start_date": "",
            "interval_days": 7,
            "count": 4,
            "last_run_date": "",
            "last_reminder_index": 0,
        },
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── crypto ────────────────────────────────────────────────
    @staticmethod
    def _fernet() -> Fernet:
        digest = hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    @classmethod
    def _encrypt(cls, value: str) -> str:
        return cls._fernet().encrypt(value.encode()).decode()

    @classmethod
    def _decrypt(cls, value: str) -> str:
        return cls._fernet().decrypt(value.encode()).decode()

    # ── storage ───────────────────────────────────────────────
    async def _get_raw(self, key: str) -> dict:
        row = await self.db.get(SystemSetting, key)
        if row is None:
            return {}
        return json.loads(row.value_json)

    async def _store(self, key: str, value: dict, user_id: str) -> None:
        row = await self.db.get(SystemSetting, key)
        if row is None:
            self.db.add(SystemSetting(key=key, value_json=json.dumps(value), updated_by=user_id))
        else:
            row.value_json = json.dumps(value)
            row.updated_by = user_id
        await self.db.flush()

    # ── shaping ───────────────────────────────────────────────
    @classmethod
    def _masked(cls, channel: str, config: dict) -> dict:
        """Replace stored secrets with `*_set` booleans — never leak plaintext."""
        out = dict(config)
        for field in cls.SECRET_FIELDS[channel]:
            raw = out.pop(field, None)
            out[f"{field}_set"] = bool(raw)
        return out

    @staticmethod
    def _resolve_secret(channel: str, raw: dict, field: str, incoming: str | None) -> str | None:
        """Keep the existing encrypted secret when the UI did not provide a new one."""
        if incoming in (None, "", KEEP_SECRET):
            existing = raw.get(field)
            return existing if existing else None
        return SettingService._encrypt(incoming)

    @staticmethod
    def _secret_set(channel: str, config: dict) -> bool:
        return any(config.get(f) for f in SettingService.SECRET_FIELDS[channel])

    # ── reads ─────────────────────────────────────────────────
    async def get_email(self) -> EmailSettingsOut:
        raw = await self._get_raw_checked("email")
        masked = self._masked("email", raw)
        return EmailSettingsOut(**masked)

    async def get_sms(self) -> SmsSettingsOut:
        raw = await self._get_raw_checked("sms")
        masked = self._masked("sms", raw)
        return SmsSettingsOut(**masked)

    async def _get_raw_checked(self, key: str) -> dict:
        raw = await self._get_raw(key)
        # Ensure every expected field exists (defaults for a never-configured channel).
        raw = {**self.DEFAULTS[key], **raw}
        # Decrypt any stored secrets so callers see clean values (still masked by _masked).
        for field in self.SECRET_FIELDS[key]:
            if raw.get(field):
                try:
                    # Verify the stored blob is decryptable — corrupt values are dropped.
                    raw[field] = self._decrypt(raw[field])
                except Exception:
                    raw[field] = None
        return raw

    async def get_plain(self, key: str, default: str = "") -> str:
        """Read a non-secret, plain-string system setting (e.g. a base URL).

        Stored under `value_json` as ``{"value": "<string>"}`` so it can share
        the same table as the encrypted channel configs.
        """
        raw = await self._get_raw(key)
        value = raw.get("value", "")
        return str(value) if value else default

    async def set_plain(self, key: str, value: str, user_id: str | None) -> None:
        """Persist a plain-string setting, trimming it to empty-safe storage."""
        await self._store(key, {"value": value.strip()}, user_id or "")

    async def get_public(self) -> NotificationSettingsOut:
        email = await self.get_email()
        sms = await self.get_sms()
        return NotificationSettingsOut(
            email=email,
            sms=sms,
            email_ready=bool(email.enabled and email.host and email.from_email),
            sms_ready=bool(
                sms.enabled and sms.provider and (sms.api_key_set or sms.api_secret_set)
            ),
        )

    # ── writes ────────────────────────────────────────────────
    async def update_email(self, data: EmailSettingsIn, user_id: str) -> EmailSettingsOut:
        raw = await self._get_raw("email")
        if data.enabled:
            if not data.host.strip() or not data.from_email.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="SMTP host and From address are required before email can be enabled",
                )

        new = data.model_dump(exclude={"password"})
        password = self._resolve_secret("email", raw, "password", data.password)
        if password:
            new["password"] = password

        old_masked = self._masked("email", raw)
        await self._store("email", new, user_id)
        out = self._masked("email", new)
        await AuditService(self.db).log(
            "system_setting",
            "email",
            "update",
            user_id,
            old_values=old_masked,
            new_values=out,
        )
        return EmailSettingsOut(**out)

    async def update_sms(self, data: SmsSettingsIn, user_id: str) -> SmsSettingsOut:
        raw = await self._get_raw("sms")
        if data.enabled:
            if not data.provider.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="SMS provider is required before SMS can be enabled",
                )

        new = data.model_dump(exclude={"api_key", "api_secret"})
        for field in ("api_key", "api_secret"):
            secret = self._resolve_secret("sms", raw, field, getattr(data, field))
            if secret:
                new[field] = secret

        old_masked = self._masked("sms", raw)
        await self._store("sms", new, user_id)
        out = self._masked("sms", new)
        await AuditService(self.db).log(
            "system_setting",
            "sms",
            "update",
            user_id,
            old_values=old_masked,
            new_values=out,
        )
        return SmsSettingsOut(**out)

    # ── payment-link reminders ───────────────────────────────
    async def get_reminder_config(self) -> dict:
        """Raw reminder schedule config merged over defaults."""
        raw = await self._get_raw("reminders")
        return {**self.DEFAULTS["reminders"], **raw}

    async def update_reminder_config(self, data: ReminderSettingsIn, user_id: str) -> dict:
        """Save the reminder schedule. Changing the start date (or disabling)
        resets the run counter so the new schedule starts fresh."""
        raw = await self._get_raw("reminders")
        if data.enabled:
            if not data.start_date.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A start date is required before reminders can be enabled",
                )

        new = {
            "enabled": data.enabled,
            "start_date": data.start_date.strip(),
            "interval_days": data.interval_days,
            "count": data.count,
            "last_run_date": raw.get("last_run_date", ""),
            "last_reminder_index": raw.get("last_reminder_index", 0),
        }
        if not data.enabled or new["start_date"] != raw.get("start_date"):
            new["last_run_date"] = ""
            new["last_reminder_index"] = 0

        old = self._masked("reminders", raw)
        await self._store("reminders", new, user_id)
        await AuditService(self.db).log(
            "system_setting",
            "reminders",
            "update",
            user_id,
            old_values=old,
            new_values=dict(new),
        )
        return new

    async def record_reminder_run(self, reminder_index: int) -> None:
        """Persist that reminder #reminder_index fired today (beat task)."""
        raw = await self._get_raw("reminders")
        from datetime import date

        raw["last_run_date"] = date.today().isoformat()
        raw["last_reminder_index"] = reminder_index
        # _store needs a user_id for audit; the scheduler has no actor, so write
        # the row directly without audit logging.
        row = await self.db.get(SystemSetting, "reminders")
        import json as _json

        if row is None:
            self.db.add(
                SystemSetting(key="reminders", value_json=_json.dumps(raw), updated_by=None)
            )
        else:
            row.value_json = _json.dumps(raw)
            row.updated_by = None
        await self.db.flush()
