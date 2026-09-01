from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, verify_student_access
from app.models.user import User
from app.schemas.credit import CreditNoteCreate, CreditNoteResponse, CreditNoteVoid
from app.services.credit import CreditService

router = APIRouter(prefix="/credit-notes", tags=["Credit Notes"])


@router.post("/", response_model=CreditNoteResponse)
async def issue_credit_note(
    data: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Issue a credit note against a student's fee account.

    With ``auto_apply`` (default), the credit is applied immediately against
    the student's oldest outstanding balances, reducing what they owe.
    """
    service = CreditService(db)
    return await service.issue(
        student_id=data.student_id,
        credit_type=data.credit_type,
        description=data.description,
        amount=data.amount,
        issued_by=user.id,
        auto_apply=data.auto_apply,
    )


@router.get("/student/{student_id}", response_model=list[CreditNoteResponse])
async def list_credit_notes(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = CreditService(db)
    return await service.list_for_student(student_id)


@router.get("/", response_model=list[CreditNoteResponse])
async def list_all_credit_notes(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = CreditService(db)
    return await service.list_all(limit=limit, offset=offset)


@router.get("/{credit_id}", response_model=CreditNoteResponse)
async def get_credit_note(
    credit_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = CreditService(db)
    return await service.get(credit_id)


@router.post("/{credit_id}/apply", response_model=CreditNoteResponse)
async def apply_credit_note(
    credit_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Manually apply a credit note's remaining value against outstanding balances."""
    service = CreditService(db)
    return await service.apply(credit_id, user.id)


@router.post("/{credit_id}/void", response_model=CreditNoteResponse)
async def void_credit_note(
    credit_id: str,
    data: CreditNoteVoid,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Void an unused credit note (no value applied)."""
    service = CreditService(db)
    return await service.void(credit_id, data, user.id)