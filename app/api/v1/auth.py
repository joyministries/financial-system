import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import BusinessRuleError, ConflictError
from app.core.rate_limit import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import PasswordResetToken, User
from app.schemas.user import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ParentRegisterCreate,
    ParentRegisterResponse,
    PasswordChange,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserResponse,
)
from app.services.audit import AuditService
from app.services.student import StudentService

router = APIRouter(prefix="/auth", tags=["Authentication"])

logger = logging.getLogger(__name__)

RESET_TOKEN_TTL_HOURS = 1


@router.post("/register", response_model=UserResponse)
async def register(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authenticated registration. Only admins can create admin/finance accounts;
    only a super admin can create another super admin."""
    if data.role in ("admin", "finance") and current_user.role not in ("admin", "super_admin"):
        raise BusinessRuleError("Only admins can create admin or finance accounts")
    if data.role == "super_admin" and current_user.role != "super_admin":
        raise BusinessRuleError("Only a super admin can create another super admin")

    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise ConflictError("Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "user", user.id, "register", current_user.id,
        new_values={"email": user.email, "role": user.role},
    )
    return user


@router.post("/register/parent", response_model=ParentRegisterResponse)
@limiter.limit("5/hour")
async def register_parent(
    request: Request,
    data: ParentRegisterCreate,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — creates the parent account AND the student application
    in one step. The student number is generated automatically and the student
    is created as PENDING until an admin approves it. Rate limited: 5/hour."""
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise ConflictError("Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=f"{data.first_name} {data.last_name}".strip(),
        role="parent",
    )
    db.add(user)
    await db.flush()

    student_service = StudentService(db)
    students = await student_service.register_with_parent(user, data)

    audit = AuditService(db)
    await audit.log("user", user.id, "self_register", user.id, new_values={"email": user.email})
    for student in students:
        name = f"{student.first_name} {student.last_name}"
        await audit.log(
            "student", student.id, "parent_register", user.id,
            new_values={"name": name, "status": "pending"},
        )

    # Notify the office: a new parent account + pending application(s).
    from app.services.notification import NotificationService

    student_names = ", ".join(
        f"{s.first_name} {s.last_name}" for s in students
    ) or "a child"
    notification = NotificationService(db)
    await notification.notify_staff(
        title="New parent registration",
        message=(
            f"{user.full_name} ({user.email}) registered and applied for "
            f"{student_names}. Application pending approval."
        ),
        category="parent_registered",
        entity_type="student",
        entity_id=students[0].id if students else None,
    )

    token = create_access_token(subject=user.id)
    return {"user": user, "students": students, "access_token": token}


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login endpoint. Rate limited: 10/minute."""
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account deactivated")

    token = create_access_token(subject=user.id)

    audit = AuditService(db)
    await audit.log("user", user.id, "login", user.id, new_values={"email": user.email})
    return Token(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset. Creates a one-time token valid for 1 hour.

    The raw token is NEVER returned to the client. When the explicit
    RESET_TOKEN_IN_RESPONSE flag is set (local development only) the token
    is printed to the backend log so flows can be tested without an email
    server. Email delivery should be wired into this path in production.
    """
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        # Do not reveal whether the email exists.
        return ForgotPasswordResponse(
            detail="If that email exists, a reset link has been generated."
        )

    raw_token = secrets.token_urlsafe(32)
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_password(raw_token),
        expires_at=datetime.now(UTC) + timedelta(hours=RESET_TOKEN_TTL_HOURS),
    )
    db.add(token)
    await db.flush()

    audit = AuditService(db)
    await audit.log("user", user.id, "forgot_password", user.id)

    settings = get_settings()
    if settings.RESET_TOKEN_IN_RESPONSE:
        logger.info(
            "Password reset token for %s (single-use, expires in %s h): %s",
            user.email,
            RESET_TOKEN_TTL_HOURS,
            raw_token,
        )
        return ForgotPasswordResponse(
            detail="Password reset token generated.",
            reset_token=raw_token,
        )
    return ForgotPasswordResponse(
        detail="If that email exists, a reset link has been generated."
    )


@router.post("/reset-password")
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Complete a password reset with a one-time token."""
    stmt = select(PasswordResetToken).where(PasswordResetToken.used == False)  # noqa: E712
    result = await db.execute(stmt)
    for token in result.scalars().all():
        if verify_password(data.token, token.token_hash):
            if token.expires_at < datetime.now(UTC):
                raise BusinessRuleError("Reset token has expired")
            user = await db.get(User, token.user_id)
            if not user:
                raise BusinessRuleError("User no longer exists")
            user.hashed_password = hash_password(data.new_password)
            token.used = True
            audit = AuditService(db)
            await audit.log("user", user.id, "reset_password", user.id)
            return {"detail": "Password reset successful"}

    raise BusinessRuleError("Invalid reset token")


@router.post("/change-password")
async def change_password(
    data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, user.hashed_password):
        raise BusinessRuleError("Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    await db.flush()

    audit = AuditService(db)
    await audit.log("user", user.id, "change_password", user.id)
    return {"detail": "Password changed"}
