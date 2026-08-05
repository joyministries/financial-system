from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.schemas.grade import (
    FeeStructureCreate,
    FeeStructureResponse,
    FeeStructureUpdate,
    GradeCreate,
    GradeResponse,
    GradeUpdate,
)
from app.services.audit import AuditService
from app.services.grade import FeeService, GradeService
from app.services.schedule import ScheduleService

router = APIRouter(prefix="/grades", tags=["Grades"])


@router.post("/", response_model=GradeResponse)
async def create_grade(
    data: GradeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = GradeService(db)
    grade = await service.create(data)
    audit = AuditService(db)
    await audit.log("grade", grade.id, "create", user.id, new_values={"name": grade.name})
    return grade


@router.get("/", response_model=list[GradeResponse])
async def list_grades(
    db: AsyncSession = Depends(get_db),
):
    """Public read-only list — used by the parent registration form to let
    applicants pick the grade they are applying for."""
    service = GradeService(db)
    return await service.list()


@router.get("/{grade_id}", response_model=GradeResponse)
async def get_grade(
    grade_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = GradeService(db)
    grade = await service.get(grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    return grade


@router.put("/{grade_id}", response_model=GradeResponse)
async def update_grade(
    grade_id: str,
    data: GradeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = GradeService(db)
    grade = await service.update(grade_id, data)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    audit = AuditService(db)
    await audit.log("grade", grade.id, "update", user.id, new_values={"name": grade.name})
    return grade


@router.delete("/{grade_id}")
async def delete_grade(
    grade_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = GradeService(db)
    if not await service.delete(grade_id):
        raise HTTPException(status_code=404, detail="Grade not found")
    audit = AuditService(db)
    await audit.log("grade", grade_id, "delete", user.id)
    return {"detail": "Grade deactivated"}


@router.post("/{grade_id}/archive")
async def archive_grade(
    grade_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = GradeService(db)
    grade = await service.archive(grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    audit = AuditService(db)
    await audit.log("grade", grade_id, "archive", user.id, new_values={"name": grade.name})
    return {"detail": "Grade archived"}


@router.post("/{grade_id}/activate")
async def activate_grade(
    grade_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = GradeService(db)
    grade = await service.activate(grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    audit = AuditService(db)
    await audit.log("grade", grade_id, "activate", user.id, new_values={"name": grade.name})
    return {"detail": "Grade activated"}


@router.post("/{grade_id}/fees", response_model=FeeStructureResponse)
async def create_fee_structure(
    grade_id: str,
    data: FeeStructureCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = FeeService(db)
    data.grade_id = grade_id
    fee = await service.create(data)
    audit = AuditService(db)
    await audit.log(
        "fee_structure", fee.id, "create", user.id,
        new_values={"category": fee.category},
    )
    return fee


@router.get("/{grade_id}/fees/public", response_model=list[FeeStructureResponse])
async def list_fee_structures_public(
    grade_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
):
    """Public fee details for a grade — used by the parent registration form
    to show the fees the student will be required to pay."""
    service = FeeService(db)
    return await service.list_by_grade(grade_id, academic_year)


@router.get("/{grade_id}/fees", response_model=list[FeeStructureResponse])
async def list_fee_structures(
    grade_id: str,
    academic_year: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = FeeService(db)
    return await service.list_by_grade(grade_id, academic_year)


@router.put("/fees/{fee_id}", response_model=FeeStructureResponse)
async def update_fee_structure(
    fee_id: str,
    data: FeeStructureUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = FeeService(db)
    fee = await service.update(fee_id, data)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee structure not found")
    audit = AuditService(db)
    await audit.log(
        "fee_structure", fee.id, "update", user.id,
        new_values={"category": fee.category},
    )
    return fee


@router.post("/fees/{fee_id}/generate-schedule")
async def generate_monthly_schedule(
    fee_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    fee_service = FeeService(db)
    schedule_service = ScheduleService(db)

    fee = await fee_service.get(fee_id)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    schedules = await schedule_service.generate_monthly_schedule(fee)
    audit = AuditService(db)
    count = len(schedules)
    await audit.log("monthly_schedule", fee.id, "generate", user.id, new_values={"count": count})
    return {"detail": f"Generated {count} monthly schedules"}
