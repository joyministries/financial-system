"""Bulk upload endpoints — Excel/CSV import for students and balances."""

import csv
import io
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.grade import Grade, Student
from app.models.user import User
from app.services.audit import AuditService

router = APIRouter(prefix="/uploads", tags=["Bulk Uploads"])


# ── Helpers ──────────────────────────────────────────────────────────


async def _read_csv(file: UploadFile) -> list[dict]:
    """Read an uploaded CSV/Excel file and return list of row dicts."""
    content = await file.read()
    text = content.decode("utf-8-sig")  # handles BOM
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


def _clean(val: str | None) -> str | None:
    if val is None:
        return None
    val = val.strip()
    return val if val else None


# ── Student Bulk Upload ──────────────────────────────────────────────


@router.post("/students")
async def bulk_upload_students(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Upload a CSV with columns: first_name, last_name, grade_name (or grade_id),
    student_number (optional — auto-generated if blank), parent_email (optional).

    Example CSV:
        first_name,last_name,grade_name,student_number,parent_email
        James,Moyo,Grade 1,,
        Sarah,Smith,Grade 2,STU-001,
    """
    rows = await _read_csv(file)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Validate required columns
    required = {"first_name", "last_name"}
    headers = set(rows[0].keys())
    missing = required - headers
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(sorted(missing))}",
        )

    # Load grade name → id map
    grade_result = await db.execute(select(Grade))
    grades = {g.name.upper(): g for g in grade_result.scalars().all()}

    created = []
    errors = []
    existing_numbers = set()

    for i, row in enumerate(rows, start=1):
        first = _clean(row.get("first_name"))
        last = _clean(row.get("last_name"))
        grade_name = _clean(row.get("grade_name"))
        grade_id = _clean(row.get("grade_id"))
        student_number = _clean(row.get("student_number"))
        _clean(row.get("parent_email"))

        if not first or not last:
            errors.append(f"Row {i}: first_name and last_name are required")
            continue

        # Resolve grade
        if grade_id:
            grade = await db.get(Grade, grade_id)
        elif grade_name:
            grade = grades.get(grade_name.upper())
        else:
            errors.append(f"Row {i}: grade_name or grade_id is required")
            continue

        if not grade:
            errors.append(f"Row {i}: grade '{grade_name or grade_id}' not found")
            continue

        # Generate student number if not provided
        if not student_number:
            count_result = await db.execute(select(Student))
            student_number = f"STU-{len(count_result.scalars().all()) + i:04d}"

        if student_number in existing_numbers:
            errors.append(f"Row {i}: duplicate student_number '{student_number}'")
            continue
        existing_numbers.add(student_number)

        # Create student
        student = Student(
            first_name=first,
            last_name=last,
            grade_id=grade.id,
            student_number=student_number,
            enrollment_date=datetime.now(UTC),
            is_active=True,
            registration_status="approved",
        )
        db.add(student)
        created.append({"row": i, "student_number": student_number, "name": f"{first} {last}"})

    await db.flush()

    await AuditService(db).log(
        "bulk_upload", "students", "upload", user.id,
        new_values={"created": len(created), "errors": len(errors)},
    )

    return {
        "detail": f"Imported {len(created)} student(s), {len(errors)} error(s)",
        "created": created,
        "errors": errors,
    }


# ── Balance Import ───────────────────────────────────────────────────


@router.post("/balances")
async def bulk_upload_balances(
    file: UploadFile = File(...),
    academic_year: int = 2026,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Upload a CSV with outstanding balances for existing students.

    Columns: student_number (required), category, amount (required), month (1-12).

    Example CSV:
        student_number,category,amount,month
        STU-0001,Tuition,5000.00,8
        STU-0001,Transport,1200.00,8
    """
    rows = await _read_csv(file)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Validate required columns
    required = {"student_number", "amount"}
    headers = set(rows[0].keys())
    missing = required - headers
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(sorted(missing))}",
        )

    created = []
    errors = []

    for i, row in enumerate(rows, start=1):
        student_number = _clean(row.get("student_number"))
        category = _clean(row.get("category")) or "Tuition"
        amount_str = _clean(row.get("amount"))
        month_str = _clean(row.get("month"))

        if not student_number:
            errors.append(f"Row {i}: student_number is required")
            continue
        if not amount_str:
            errors.append(f"Row {i}: amount is required")
            continue

        try:
            amount = Decimal(amount_str)
        except (InvalidOperation, ValueError):
            errors.append(f"Row {i}: invalid amount '{amount_str}'")
            continue

        month = int(month_str) if month_str else None

        # Find the student
        stmt = select(Student).where(Student.student_number == student_number)
        result = await db.execute(stmt)
        student = result.scalar_one_or_none()

        if not student:
            errors.append(f"Row {i}: student '{student_number}' not found")
            continue

        # Create an AdditionalCharge as the balance entry
        from app.models.schedule import AdditionalCharge

        charge = AdditionalCharge(
            student_id=student.id,
            grade_id=student.grade_id,
            academic_year=academic_year,
            charge_type=category,
            description=f"Imported balance — {category}",
            amount=amount,
            month=month or 1,
            is_paid=False,
        )
        db.add(charge)
        created.append({
            "row": i,
            "student_number": student_number,
            "category": category,
            "amount": str(amount),
        })

    await db.flush()

    await AuditService(db).log(
        "bulk_upload", "balances", "upload", user.id,
        new_values={"created": len(created), "errors": len(errors)},
    )

    return {
        "detail": f"Imported {len(created)} balance(s), {len(errors)} error(s)",
        "created": created,
        "errors": errors,
    }
