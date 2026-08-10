from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role, verify_student_access
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.student import (
    AdminStudentRegisterCreate,
    AdminStudentRegisterResponse,
    ChildRegisterCreate,
    GuardianResponse,
    GuardianUpdate,
    PaymentPreferenceUpdate,
    RegistrationFeeResponse,
    StudentCreate,
    StudentResponse,
    StudentUpdate,
)
from app.services.audit import AuditService
from app.services.student import StudentService

router = APIRouter(prefix="/students", tags=["Students"])


@router.post("/register-child", response_model=StudentResponse)
@limiter.limit("20/hour")
async def register_child(
    request: Request,
    data: ChildRegisterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("parent")),
):
    """Parents register their child. Creates the student as PENDING — an admin
    must approve it before the child is fully enrolled."""
    service = StudentService(db)
    student = await service.register_child(user, data)
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log(
        "student", student.id, "parent_register", user.id,
        new_values={"name": name, "status": "pending"},
    )

    # Notify the office: a new student application from an existing parent.
    from app.services.notification import NotificationService

    grade_name = student.grade.name if student.grade else "Unknown grade"
    notification = NotificationService(db)
    await notification.notify_staff(
        title="New student application",
        message=(
            f"{user.full_name} applied for {name} ({grade_name}). "
            "Application pending approval."
        ),
        category="student_applied",
        entity_type="student",
        entity_id=student.id,
    )
    return student


@router.post("/admin-register", response_model=AdminStudentRegisterResponse)
async def admin_register_student(
    data: AdminStudentRegisterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    """Admin self-service: register a student AND create/link the parent's
    portal account in one action. The student is created as APPROVED (no
    pending step). When a NEW parent account is created, the response carries
    the one-time temporary password for the admin to hand over; when an
    existing user with that email is linked, temporary_password is None."""
    service = StudentService(db)
    student, parent, temp_password = await service.admin_register(data)
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log(
        "student", student.id, "admin_register", user.id,
        new_values={
            "name": name,
            "parent_email": str(data.parent_email),
            "parent_account_created": temp_password is not None,
        },
    )
    return AdminStudentRegisterResponse(
        student=student,
        parent=parent,
        temporary_password=temp_password,
    )


@router.get("/{student_id}/registration-fee", response_model=RegistrationFeeResponse)
async def get_registration_fee(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parent-facing registration fee for a child: the active 'Registration'
    fee structure for the child's grade in the current year plus whether it
    has been fully settled. Parents may only query their own children."""
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StudentService(db)
    return await service.get_registration_fee(student_id)


@router.get("/pending", response_model=list[StudentResponse])
async def list_pending_registrations(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Parent-submitted child registrations awaiting approval."""
    service = StudentService(db)
    return await service.list_pending(limit=limit)


@router.post("/{student_id}/approve", response_model=StudentResponse)
async def approve_registration(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = StudentService(db)
    student = await service.set_registration_status(student_id, "approved")
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log("student", student.id, "approve", user.id, new_values={"name": name})
    return student


@router.post("/{student_id}/reject", response_model=StudentResponse)
async def reject_registration(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = StudentService(db)
    student = await service.set_registration_status(student_id, "rejected")
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log("student", student.id, "reject", user.id, new_values={"name": name})
    return student


@router.post("/", response_model=StudentResponse)
async def create_student(
    data: StudentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = StudentService(db)
    student = await service.create(data)
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log("student", student.id, "create", user.id, new_values={"name": name})
    return student


@router.get("/", response_model=list[StudentResponse])
async def list_students(
    grade_id: str | None = None,
    parent_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = StudentService(db)
    # Parents can only see their own children
    if user.role == "parent":
        return await service.list_by_parent(user.id, limit=limit, offset=offset)
    if parent_id:
        return await service.list_by_parent(parent_id, limit=limit, offset=offset)
    if grade_id:
        return await service.list_by_grade(grade_id, limit=limit, offset=offset)
    return await service.list_all(limit=limit, offset=offset)


@router.get("/registrations", response_model=list[StudentResponse])
async def recent_registrations(
    limit: int = Query(default=20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Newest student registrations, most recent first (for the admin sidebar)."""
    service = StudentService(db)
    return await service.list_recent(limit=limit)


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = StudentService(db)
    student = await service.get(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if user.role == "parent" and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return student


@router.get("/number/{student_number}", response_model=StudentResponse)
async def get_student_by_number(
    student_number: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = StudentService(db)
    student = await service.get_by_number(student_number)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if user.role == "parent" and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return student


@router.put("/{student_id}/guardians/{guardian_id}", response_model=GuardianResponse)
async def update_guardian(
    student_id: str,
    guardian_id: str,
    data: GuardianUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parents update contact details of the guardians on their own children."""
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StudentService(db)
    guardian = await service.update_guardian(student_id, guardian_id, data)
    if not guardian:
        raise HTTPException(status_code=404, detail="Guardian not found")
    audit = AuditService(db)
    await audit.log(
        "student_guardian", guardian.id, "update", user.id,
        new_values={"student_id": student_id},
    )
    return guardian


@router.put("/{student_id}/payment-preference", response_model=StudentResponse)
@limiter.limit("20/hour")
async def update_payment_preference(
    student_id: str,
    data: PaymentPreferenceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parent sets how they intend to pay for a child's fees:
    monthly (per-month installments) or cumulative (full-year lump sum)."""
    if user.role == "parent":
        await verify_student_access(student_id, user, db)
    service = StudentService(db)
    student = await service.update(
        student_id, StudentUpdate(payment_preference=data.payment_preference)
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    audit = AuditService(db)
    await audit.log(
        "student", student.id, "update_payment_preference", user.id,
        new_values={"payment_preference": data.payment_preference},
    )
    return student


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    data: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "finance")),
):
    service = StudentService(db)
    student = await service.update(student_id, data)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    audit = AuditService(db)
    name = f"{student.first_name} {student.last_name}"
    await audit.log("student", student.id, "update", user.id, new_values={"name": name})
    return student


@router.delete("/{student_id}")
async def deactivate_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    service = StudentService(db)
    if not await service.deactivate(student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    audit = AuditService(db)
    await audit.log("student", student_id, "deactivate", user.id)
    return {"detail": "Student deactivated"}
