from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.schemas.grade import (
    BulkFeeOverrideCreate,
    FeeStructureCreate,
    FeeStructureResponse,
    FeeStructureUpdate,
    GradeCreate,
    GradeResponse,
    GradeUpdate,
    StudentFeeOverrideCreate,
    StudentFeeOverrideResponse,
    StudentFeeOverrideUpdate,
)
from app.services.audit import AuditService
from app.services.grade import FeeService, GradeService
from app.services.schedule import ScheduleService

router = APIRouter(prefix="/grades", tags=["Grades"])


# ── Per-student fee overrides (discounts) ────────────────────────────
# MUST be declared BEFORE /{grade_id} to avoid FastAPI path param collision.


@router.post("/fee-overrides", response_model=StudentFeeOverrideResponse)
async def create_fee_override(
    data: StudentFeeOverrideCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Set a per-student fee override (discount). The admin can give a
    specific learner a discounted tuition without changing the grade fee."""
    from app.models.grade import StudentFeeOverride
    from app.models.grade import FeeStructure

    # Validate the fee structure exists
    fee = await db.get(FeeStructure, data.fee_structure_id)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    # Validate the student exists
    from app.models.grade import Student
    student = await db.get(Student, data.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    override = StudentFeeOverride(
        student_id=data.student_id,
        fee_structure_id=data.fee_structure_id,
        annual_amount=data.annual_amount,
        discount_type=data.discount_type,
        reason=data.reason,
        created_by=user.id,
    )
    db.add(override)
    await db.flush()
    await AuditService(db).log(
        "student_fee_override", override.id, "create", user.id,
        new_values={"student_id": data.student_id, "amount": str(data.annual_amount)},
    )
    return override


@router.get("/fee-overrides", response_model=list[StudentFeeOverrideResponse])
async def list_fee_overrides(
    student_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """List fee overrides, optionally filtered by student."""
    from app.models.grade import StudentFeeOverride
    from sqlalchemy import select

    stmt = select(StudentFeeOverride).where(StudentFeeOverride.is_active == True)
    if student_id:
        stmt = stmt.where(StudentFeeOverride.student_id == student_id)
    stmt = stmt.order_by(StudentFeeOverride.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.put("/fee-overrides/{override_id}", response_model=StudentFeeOverrideResponse)
async def update_fee_override(
    override_id: str,
    data: StudentFeeOverrideUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Update a fee override (amount, type, reason, active status)."""
    from app.models.grade import StudentFeeOverride

    override = await db.get(StudentFeeOverride, override_id)
    if not override:
        raise HTTPException(status_code=404, detail="Fee override not found")

    if data.annual_amount is not None:
        override.annual_amount = data.annual_amount
    if data.discount_type is not None:
        override.discount_type = data.discount_type
    if data.reason is not None:
        override.reason = data.reason
    if data.is_active is not None:
        override.is_active = data.is_active

    await db.flush()
    await AuditService(db).log(
        "student_fee_override", override_id, "update", user.id,
        new_values=data.model_dump(exclude_unset=True),
    )
    return override


@router.delete("/fee-overrides/{override_id}")
async def delete_fee_override(
    override_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Soft-delete a fee override (set is_active=False)."""
    from app.models.grade import StudentFeeOverride

    override = await db.get(StudentFeeOverride, override_id)
    if not override:
        raise HTTPException(status_code=404, detail="Fee override not found")

    override.is_active = False
    await db.flush()
    await AuditService(db).log("student_fee_override", override_id, "delete", user.id)
    return {"detail": "Fee override deactivated"}


@router.post("/fee-overrides/bulk", response_model=list[StudentFeeOverrideResponse])
async def bulk_create_fee_overrides(
    data: BulkFeeOverrideCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Apply the same discount to multiple students at once. Skips students
    that already have an active override for the same fee structure."""
    from app.models.grade import FeeStructure, Student, StudentFeeOverride
    from sqlalchemy import select

    # Validate fee structure
    fee = await db.get(FeeStructure, data.fee_structure_id)
    if not fee:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    # Find which students already have an active override for this fee
    existing_stmt = select(StudentFeeOverride.student_id).where(
        StudentFeeOverride.fee_structure_id == data.fee_structure_id,
        StudentFeeOverride.is_active == True,  # noqa: E712
        StudentFeeOverride.student_id.in_(data.student_ids),
    )
    existing_ids = set((await db.execute(existing_stmt)).scalars().all())

    created = []
    skipped = []
    for sid in data.student_ids:
        if sid in existing_ids:
            skipped.append(sid)
            continue
        student = await db.get(Student, sid)
        if not student:
            skipped.append(sid)
            continue
        override = StudentFeeOverride(
            student_id=sid,
            fee_structure_id=data.fee_structure_id,
            annual_amount=data.annual_amount,
            discount_type=data.discount_type,
            reason=data.reason,
            created_by=user.id,
        )
        db.add(override)
        created.append(sid)

    await db.flush()

    # Fetch the created overrides to return them
    if created:
        result_stmt = select(StudentFeeOverride).where(
            StudentFeeOverride.student_id.in_(created),
            StudentFeeOverride.fee_structure_id == data.fee_structure_id,
            StudentFeeOverride.is_active == True,  # noqa: E712
        )
        overrides = list((await db.execute(result_stmt)).scalars().all())
    else:
        overrides = []

    await AuditService(db).log(
        "student_fee_override", "bulk", "create", user.id,
        new_values={
            "student_ids": created,
            "skipped": skipped,
            "fee_structure_id": data.fee_structure_id,
            "amount": str(data.annual_amount),
        },
    )
    return overrides


# ── Grades & Fee Structures ──────────────────────────────────────────


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



