"""User management endpoints — super_admin only."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import (
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserUpdate,
    UserResponse,
)
from app.services.audit import AuditService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=list[UserResponse])
async def list_staff_users(
    _user: User = Depends(require_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all admin and finance user accounts.

    Only accessible by super_admin. Returns every non-parent account
    so the super admin can see who has staff access to the platform.
    """
    stmt = (
        select(User)
        .where(User.role.in_(["admin", "finance", "super_admin"]))
        .order_by(User.role, User.full_name)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=UserResponse)
async def create_staff_user(
    data: AdminUserCreate,
    current_user: User = Depends(require_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new staff account (admin, finance, or super_admin).

    Only accessible by super_admin. Returns the created user.
    """
    stmt = select(User).where(User.email == data.email)
    if (await db.execute(stmt)).scalar_one_or_none():
        raise ConflictError("Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role=data.role,
    )
    db.add(user)
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "user", user.id, "create_staff", current_user.id,
        new_values={"email": user.email, "role": user.role, "full_name": user.full_name},
    )
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_staff_user(
    user_id: str,
    data: AdminUserUpdate,
    current_user: User = Depends(require_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Update a staff account. Only super_admin can modify staff users."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "parent":
        raise HTTPException(status_code=400, detail="Cannot modify parent accounts here")

    if data.email is not None and data.email != user.email:
        stmt = select(User).where(User.email == data.email)
        if (await db.execute(stmt)).scalar_one_or_none():
            raise ConflictError("Email already registered")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active

    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "user", user.id, "update_staff", current_user.id,
        new_values={"email": user.email, "role": user.role, "is_active": user.is_active},
    )
    return user


@router.delete("/{user_id}")
async def deactivate_staff_user(
    user_id: str,
    current_user: User = Depends(require_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a staff account. Sets is_active=False instead of deleting."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    if user.role == "parent":
        raise HTTPException(status_code=400, detail="Cannot modify parent accounts here")

    user.is_active = False
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "user", user.id, "deactivate_staff", current_user.id,
        new_values={"email": user.email, "is_active": False},
    )
    return {"detail": f"Account {user.email} deactivated"}


@router.post("/{user_id}/reset-password")
async def reset_staff_password(
    user_id: str,
    data: AdminPasswordReset,
    current_user: User = Depends(require_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Reset a staff account's password. Super admin only."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "parent":
        raise HTTPException(status_code=400, detail="Cannot reset parent passwords here")

    user.hashed_password = hash_password(data.new_password)
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "user", user.id, "admin_password_reset", current_user.id,
        new_values={"email": user.email},
    )
    return {"detail": f"Password reset for {user.email}"}
