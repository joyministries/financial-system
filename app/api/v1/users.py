"""User management endpoints — super_admin only."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.user import User
from app.schemas.user import UserResponse

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
