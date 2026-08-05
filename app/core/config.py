import logging
from functools import lru_cache

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_INSECURE_DEFAULTS = {"CHANGE-ME-IN-PRODUCTION", "changeme"}


class Settings(BaseSettings):
    APP_NAME: str = "School Financial System"
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
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    SUPERADMIN_EMAIL: str = "admin@school.com"
    SUPERADMIN_PASSWORD: str = "changeme"

    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Uploaded application documents (birth certificates, transcripts, ...).
    # Relative paths resolve against the project root.
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    model_config = {"env_file": ".env", "case_sensitive": True}

    def validate_secrets(self) -> None:
        """Log warnings for insecure defaults. In non-debug mode, refuse to start."""
        insecure = []
        if self.JWT_SECRET_KEY in _INSECURE_DEFAULTS:
            insecure.append("JWT_SECRET_KEY")
        if self.SUPERADMIN_PASSWORD in _INSECURE_DEFAULTS:
            insecure.append("SUPERADMIN_PASSWORD")

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
