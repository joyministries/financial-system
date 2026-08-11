import logging
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_INSECURE_DEFAULTS = {"CHANGE-ME-IN-PRODUCTION", "changeme"}


class Settings(BaseSettings):
    APP_NAME: str = "Lambton School"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    # NEVER enable in a deployment reachable by anyone but the developer.
    # Password-reset tokens are returned in the API response and printed to
    # the backend log ONLY when this is true. Default is OFF.
    RESET_TOKEN_IN_RESPONSE: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/school_finance"
    DATABASE_ECHO: bool = False

    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"

    JWT_SECRET_KEY: str = "CHANGE-ME-IN-PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    # Fallback default; auth endpoints explicitly issue 30-minute tokens for
    # normal users and 2-hour tokens for admins (see app/api/v1/auth.py).
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Bearer token that authorizes the /api/v1/system/* cron + migrate endpoints.
    # Empty = only Vercel Cron's `x-vercel-cron` header may trigger them.
    CRON_SECRET: str = ""

    # Viewed (read) notifications are auto-deleted this many seconds after the
    # user opens them. Unread notifications are never deleted.
    READ_NOTIFICATION_RETENTION_SECONDS: int = 10

    SUPERADMIN_EMAIL: str = "admin@school.com"
    SUPERADMIN_PASSWORD: str = "changeme"

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Uploaded application documents (birth certificates, transcripts, ...).
    # Relative paths resolve against the project root.
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # ── PayFast payment gateway ────────────────────────────────────────────
    # Set PAYFAST_MERCHANT_ID + PAYFAST_MERCHANT_KEY from your PayFast
    # dashboard (sandbox or live). PASSPHRASE is optional — only set it if
    # you configured a passphrase on the PayFast dashboard; it is included in
    # the MD5 signature when non-empty.
    PAYFAST_MERCHANT_ID: str = ""
    PAYFAST_MERCHANT_KEY: str = ""
    PAYFAST_PASSPHRASE: str = ""
    # "sandbox" (https://sandbox.payfast.co.za) or "live" (https://www.payfast.co.za)
    PAYFAST_MODE: str = "sandbox"
    # Browser redirect targets. If unset, they resolve against PAYFAST_BASE_URL.
    PAYFAST_BASE_URL: str = "http://localhost:8000"
    PAYFAST_RETURN_URL: str = ""
    PAYFAST_CANCEL_URL: str = ""
    PAYFAST_NOTIFY_URL: str = ""
    # Where the browser lands after payment (success/cancel) when the
    # PayFast return/cancel URLs are not set explicitly.
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": True}

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _ensure_async_driver(cls, v: object) -> object:
        """Render/Heroku hand out plain `postgres://` / `postgresql://` URLs.

        SQLAlchemy async needs the `postgresql+asyncpg://` driver scheme, so
        rewrite it here rather than forcing an extra env var on every host.
        """
        if not isinstance(v, str):
            return v
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+asyncpg://" + v[len(prefix):]
        return v

    def validate_secrets(self) -> None:
        """Log warnings for insecure defaults. In non-debug mode, refuse to start."""
        insecure = []
        if self.JWT_SECRET_KEY in _INSECURE_DEFAULTS:
            insecure.append("JWT_SECRET_KEY")
        if self.SUPERADMIN_PASSWORD in _INSECURE_DEFAULTS:
            insecure.append("SUPERADMIN_PASSWORD")
        if self.PAYFAST_MODE not in ("sandbox", "live"):
            raise ValueError("PAYFAST_MODE must be 'sandbox' or 'live'")

        if not insecure:
            return

        msg = f"Insecure default values detected for: {', '.join(insecure)}"
        if self.DEBUG:
            logger.warning(msg + " — acceptable in DEBUG mode only")
        else:
            raise RuntimeError(
                msg + " — set these via environment variables before running"
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_secrets()
    return settings
