from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    subject = decode_access_token(token)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == subject))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        # super_admin is a superset of admin: it satisfies any admin-level gate.
        allowed = user.role == "super_admin" or user.role in roles
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user
    return _check


async def verify_student_access(
    student_id: str,
    user: User,
    db: AsyncSession,
) -> None:
    """For parent users, verify they own the student. Admin/finance can access all."""
    if user.role == "parent":
        from app.models.grade import Student
        student = await db.get(Student, student_id)
        if not student or student.parent_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def get_parent_student_ids(
    user: User,
    db: AsyncSession,
) -> list[str] | None:
    """Return student IDs for a parent user, or None for admin/finance (no filter)."""
    if user.role != "parent":
        return None
    from app.models.grade import Student
    stmt = select(Student.id).where(
        Student.parent_id == user.id,
        Student.is_active == True,  # noqa: E712
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
