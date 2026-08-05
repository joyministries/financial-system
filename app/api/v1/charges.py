from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, verify_student_access
from app.models.user import User
from app.schemas.charge import (
    AdditionalChargeCreate,
    AdditionalChargeResponse,
    GradeChargeCreate,
)
from app.services.audit import AuditService
from app.services.charge import ChargeService

router = APIRouter(prefix="/charges", tags=["Additional Charges"])


@router.post("/", response_model=AdditionalChargeResponse)
async def create_charge(
    data: AdditionalChargeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ChargeService(db)
    charge = await service.create(data)
    audit = AuditService(db)
    await audit.log(
        "additional_charge", charge.id, "create", user.id,
        new_values={"type": charge.charge_type, "amount": str(charge.amount)},
    )
    return charge


@router.post("/grade", response_model=list[AdditionalChargeResponse])
async def create_grade_charge(
    data: GradeChargeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Apply one charge to every active student in a grade.

    Students can opt out by sending their id in exclude_student_ids
    (e.g. a student not attending the excursion).
    """
    service = ChargeService(db)
    charges = await service.create_for_grade(data)
    audit = AuditService(db)
    await audit.log(
        "additional_charge",
        data.grade_id,
        "create_for_grade",
        user.id,
        new_values={
            "type": data.charge_type,
            "amount": str(data.amount),
            "students_charged": len(charges),
            "excluded": list(data.exclude_student_ids),
        },
    )
    return charges


@router.get("/student/{student_id}", response_model=list[AdditionalChargeResponse])
async def list_charges(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = ChargeService(db)
    return await service.list_for_student(student_id, academic_year)


@router.get("/student/{student_id}/unpaid", response_model=list[AdditionalChargeResponse])
async def list_unpaid_charges(
    student_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = ChargeService(db)
    return await service.get_unpaid(student_id, academic_year)


@router.delete("/{charge_id}")
async def delete_charge(
    charge_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = ChargeService(db)
    if not await service.delete(charge_id):
        raise HTTPException(status_code=404, detail="Charge not found")
    audit = AuditService(db)
    await audit.log("additional_charge", charge_id, "delete", user.id)
    return {"detail": "Charge deleted"}
