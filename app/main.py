import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.models.user import User

settings = get_settings()
logger = logging.getLogger(__name__)


async def _seed_admin() -> None:
    """Create the superadmin account if it doesn't already exist."""
    async with async_session_factory() as db:
        stmt = select(User).where(User.email == settings.SUPERADMIN_EMAIL)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            return

        admin = User(
            email=settings.SUPERADMIN_EMAIL,
            hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
            full_name="System Admin",
            role="admin",
        )
        db.add(admin)
        await db.commit()
        logger.info(f"Created superadmin account: {settings.SUPERADMIN_EMAIL}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await _seed_admin()
    except Exception as e:
        logger.warning(f"Could not seed admin (DB may not be ready): {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    # Never expose the OpenAPI schema outside of DEBUG mode.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Hardening headers on every response.

    The CSP is skipped for the API-docs routes because Swagger UI relies on
    inline styles/scripts; docs are also disabled entirely outside DEBUG.
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; "
            "base-uri 'self'; form-action 'self'"
        )
    return response

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
