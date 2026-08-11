import logging
import secrets
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.grade import Enrollment, FeeStructure, Student, StudentGuardian
from app.models.schedule import MonthlySchedule, OutstandingBalance
from app.models.user import User
from app.schemas.student import (
    AdminStudentRegisterCreate,
    ChildRegisterCreate,
    GuardianUpdate,
    RegistrationFeeResponse,
    StudentCreate,
    StudentUpdate,
)
from app.schemas.user import ParentRegisterCreate

logger = logging.getLogger(__name__)


def _apply_search(stmt, search: str | None):
    """Add a case-insensitive name / student-number filter to a Student query."""
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Student.first_name.ilike(term),
                Student.last_name.ilike(term),
                Student.student_number.ilike(term),
            )
        )
    return stmt


class StudentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_child(self, parent: User, data: ChildRegisterCreate) -> Student:
        """Parent-facing registration. Creates the student as PENDING until an
        admin approves it. The logged-in parent becomes the primary guardian
        and is linked as the student's parent_id. The parent's guardian record
        for THIS child carries the relationship / phone / address supplied in
        the modal (falling back to the account details); the other parent's
        details are attached when provided (only one parent is required).
        """
        relationship = data.relationship or "father"
        parent_guardian = StudentGuardian(
            guardian_type=relationship,
            full_name=parent.full_name,
            guardian_id=data.guardian_id,
            email=str(data.email) if data.email else parent.email,
            phone=data.phone,
            physical_address=data.physical_address,
            po_box=data.po_box,
        )
        other_guardian = None
        if data.other_parent:
            other_type = "mother" if relationship == "father" else "father"
            other_guardian = StudentGuardian(
                guardian_type=other_type,
                first_name=data.other_parent.first_name,
                last_name=data.other_parent.last_name,
                full_name=data.other_parent.display_name,
                guardian_id=data.other_parent.guardian_id,
                phone=data.other_parent.phone,
                email=str(data.other_parent.email) if data.other_parent.email else None,
                physical_address=data.other_parent.physical_address,
                po_box=data.other_parent.po_box,
            )
        return await self._create_pending_student(
            parent=parent,
            first_name=data.first_name,
            last_name=data.last_name,
            grade_id=data.grade_id,
            parent_guardian=parent_guardian,
            other_guardian=other_guardian,
        )

    async def register_with_parent(
        self, parent: User, data: ParentRegisterCreate
    ) -> list[Student]:
        """Create the pending student applications submitted during first-time
        parent registration. The parent's guardian record carries their split
        names, phone, and physical address; the other parent's details are
        attached when provided (only one parent is required). The other parent
        gets the opposite guardian_type. Supports registering more than one
        child in the same submission via data.additional_students.
        """

        def build_guardians() -> tuple[StudentGuardian, StudentGuardian | None]:
            parent_guardian = StudentGuardian(
                guardian_type=data.relationship,
                first_name=data.first_name,
                last_name=data.last_name,
                full_name=f"{data.first_name} {data.last_name}".strip(),
                phone=data.phone,
                email=parent.email,
                physical_address=data.physical_address,
                po_box=data.po_box,
            )
            other_guardian = None
            if data.other_parent:
                other_type = "mother" if data.relationship == "father" else "father"
                other_guardian = StudentGuardian(
                    guardian_type=other_type,
                    first_name=data.other_parent.first_name,
                    last_name=data.other_parent.last_name,
                    full_name=data.other_parent.display_name,
                    guardian_id=data.other_parent.guardian_id,
                    phone=data.other_parent.phone,
                    email=str(data.other_parent.email) if data.other_parent.email else None,
                    physical_address=data.other_parent.physical_address,
                    po_box=data.other_parent.po_box,
                )
            return parent_guardian, other_guardian

        created: list[Student] = []
        for child in [data.student, *data.additional_students]:
            parent_guardian, other_guardian = build_guardians()
            created.append(
                await self._create_pending_student(
                    parent=parent,
                    first_name=child.first_name,
                    last_name=child.last_name,
                    grade_id=child.grade_id,
                    parent_guardian=parent_guardian,
                    other_guardian=other_guardian,
                )
            )
        return created

    async def _create_pending_student(
        self,
        parent: User,
        first_name: str,
        last_name: str,
        grade_id: str,
        parent_guardian: StudentGuardian,
        other_guardian: StudentGuardian | None = None,
    ) -> Student:
        """Shared core for pending student applications: generates the student
        number, links the registering parent as guardian + parent_id, and
        creates the current-year enrollment."""
        student_number = await self._generate_student_number()
        await self._reject_duplicate_application(
            parent=parent,
            first_name=first_name,
            last_name=last_name,
            guardian_email=parent_guardian.email,
        )
        guardians: list[StudentGuardian] = [parent_guardian]
        if other_guardian:
            guardians.append(other_guardian)

        student = Student(
            student_number=student_number,
            first_name=first_name,
            last_name=last_name,
            grade_id=grade_id,
            parent_id=parent.id,
            enrollment_date=datetime.now(UTC),
            registration_status="pending",
            guardians=guardians,
        )
        self.db.add(student)
        await self.db.flush()

        enrollment = Enrollment(
            student_id=student.id,
            academic_year=datetime.now(UTC).year,
            grade_id=grade_id,
        )
        self.db.add(enrollment)
        await self.db.flush()
        return student

    async def _reject_duplicate_application(
        self,
        parent: User,
        first_name: str,
        last_name: str,
        guardian_email: str | None,
    ) -> None:
        """Conservative duplicate detection for parent-submitted registrations.

        Flags a new application when an ACTIVE student already exists with
        the same (case-insensitive) name AND either:
          - the same portal parent registered them, or
          - a guardian contact (email) matches the registering parent.

        This catches accidental double-submission without blocking legitimate
        same-name registrations by unrelated families. Full identity-based
        dedup needs D.O.B./national-ID fields (future work).
        """
        norm_first = first_name.strip().lower()
        norm_last = last_name.strip().lower()
        norm_email = (guardian_email or "").strip().lower()
        if not norm_first or not norm_last:
            return

        conditions = [
            func.lower(Student.first_name) == norm_first,
            func.lower(Student.last_name) == norm_last,
            Student.is_active == True,  # noqa: E712
        ]
        if norm_email:
            conditions.append(
                or_(
                    Student.parent_id == parent.id,
                    func.lower(StudentGuardian.email) == norm_email,
                )
            )
        else:
            conditions.append(Student.parent_id == parent.id)

        stmt = (
            select(Student)
            .join(StudentGuardian, StudentGuardian.student_id == Student.id)
            .where(*conditions)
            .limit(1)
        )
        existing = (await self.db.execute(stmt)).scalar_one_or_none()
        if existing:
            raise ConflictError(
                "A student with this name is already registered for your "
                "account/guardian. If this is a second legal parent, contact "
                "the school to be linked to the existing registration instead "
                "of creating a duplicate."
            )

    async def _generate_student_number(self) -> str:
        while True:
            candidate = f"REG-{datetime.now(UTC).year}-{secrets.token_hex(3).upper()}"
            if not await self.get_by_number(candidate):
                return candidate

    async def create(self, data: StudentCreate) -> Student:
        # Unique student number guard (DB unique index is the backstop).
        existing = await self.get_by_number(data.student_number)
        if existing:
            raise ConflictError(
                f"Student number '{data.student_number}' is already in use"
            )

        primary_linked_user = await self._link_guardian_user(
            data.parent_1.display_name, str(data.parent_1.email) if data.parent_1.email else None
        )

        guardians: list[StudentGuardian] = [
            StudentGuardian(
                guardian_type="father",
                first_name=data.parent_1.first_name,
                last_name=data.parent_1.last_name,
                full_name=data.parent_1.display_name,
                guardian_id=data.parent_1.guardian_id,
                phone=data.parent_1.phone,
                email=str(data.parent_1.email) if data.parent_1.email else None,
                physical_address=data.parent_1.physical_address,
                po_box=data.parent_1.po_box,
            )
        ]
        if data.parent_2:
            guardians.append(
                StudentGuardian(
                    guardian_type="mother",
                    first_name=data.parent_2.first_name,
                    last_name=data.parent_2.last_name,
                    full_name=data.parent_2.display_name,
                    guardian_id=data.parent_2.guardian_id,
                    phone=data.parent_2.phone,
                    email=str(data.parent_2.email) if data.parent_2.email else None,
                    physical_address=data.parent_2.physical_address,
                    po_box=data.parent_2.po_box,
                )
            )

        # Pass guardians in the constructor so the relationship is populated
        # in-memory BEFORE flush — assigning after flush triggers a lazy load
        # (MissingGreenlet in async).
        student = Student(
            student_number=data.student_number,
            first_name=data.first_name,
            last_name=data.last_name,
            grade_id=data.grade_id,
            parent_id=primary_linked_user.id if primary_linked_user else None,
            enrollment_date=data.enrollment_date,
            guardians=guardians,
        )
        self.db.add(student)
        await self.db.flush()

        enrollment = Enrollment(
            student_id=student.id,
            academic_year=data.enrollment_date.year,
            grade_id=data.grade_id,
        )
        self.db.add(enrollment)
        await self.db.flush()
        return student

    async def _link_guardian_user(self, full_name: str, email: str | None) -> User | None:
        """Link the primary guardian to a portal (parent) account.

        If a user with the guardian's email already exists, link to it.
        Otherwise create a parent account with a RANDOM password (never a
        shared default) and log it once so the school can hand it over.
        Email delivery of credentials is future work.
        """
        if not email:
            return None
        stmt = select(User).where(User.email == email)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            return user
        temp_password = secrets.token_urlsafe(12)
        user = User(
            email=email,
            full_name=full_name,
            role="parent",
            hashed_password=hash_password(temp_password),
        )
        self.db.add(user)
        await self.db.flush()
        logger.info(
            "Created portal account for guardian %s (%s) — temporary password: %s",
            full_name,
            email,
            temp_password,
        )
        return user

    async def admin_register(
        self, data: AdminStudentRegisterCreate
    ) -> tuple[Student, User, str | None]:
        """Admin self-service registration: create the student AND create/link
        the parent's portal account in one action.

        - The parent email is the portal login. If a user with that email
          already exists it is linked (no duplicate account, temp password is
          None). Otherwise a parent account is created with a random temporary
          password which is returned ONCE in the response for the admin to hand
          over.
        - The student is created as APPROVED and ACTIVE — no pending approval
          step, unlike the parent-facing register_child flow.
        - Primary guardian = the parent account holder; the other parent's
          details are attached when provided.

        Returns (student, parent_user, temporary_password_or_None).
        """
        # Resolve the parent portal account first (create-or-link).
        parent, temp_password = await self._create_or_link_parent(
            email=str(data.parent_email),
            full_name=data.parent_full_name,
        )

        # Generate a unique student number before inserting.
        student_number = await self._generate_student_number()

        relationship = data.relationship or "father"
        parent_guardian = StudentGuardian(
            guardian_type=relationship,
            full_name=data.parent_full_name,
            guardian_id=data.guardian_id,
            email=str(data.parent_email),
            phone=data.phone,
            physical_address=data.physical_address,
            po_box=data.po_box,
        )
        guardians: list[StudentGuardian] = [parent_guardian]
        if data.other_parent:
            other_type = "mother" if relationship == "father" else "father"
            guardians.append(
                StudentGuardian(
                    guardian_type=other_type,
                    first_name=data.other_parent.first_name,
                    last_name=data.other_parent.last_name,
                    full_name=data.other_parent.display_name,
                    guardian_id=data.other_parent.guardian_id,
                    phone=data.other_parent.phone,
                    email=str(data.other_parent.email)
                    if data.other_parent.email
                    else None,
                    physical_address=data.other_parent.physical_address,
                    po_box=data.other_parent.po_box,
                )
            )

        enrollment_date = data.enrollment_date or datetime.now(UTC)
        student = Student(
            student_number=student_number,
            first_name=data.first_name,
            last_name=data.last_name,
            grade_id=data.grade_id,
            parent_id=parent.id,
            enrollment_date=enrollment_date,
            registration_status="approved",
            guardians=guardians,
        )
        self.db.add(student)
        await self.db.flush()

        enrollment = Enrollment(
            student_id=student.id,
            academic_year=enrollment_date.year,
            grade_id=data.grade_id,
        )
        self.db.add(enrollment)
        await self.db.flush()
        return student, parent, temp_password

    async def _create_or_link_parent(
        self, email: str, full_name: str
    ) -> tuple[User, str | None]:
        """Return (parent_user, temporary_password). When a user with the email
        already exists it is linked and temp_password is None; otherwise a
        parent account is created with a random temporary password that the
        caller must return to the admin exactly once."""
        stmt = select(User).where(User.email == email)
        existing = (await self.db.execute(stmt)).scalar_one_or_none()
        if existing:
            return existing, None
        temp_password = secrets.token_urlsafe(12)
        user = User(
            email=email,
            full_name=full_name,
            role="parent",
            hashed_password=hash_password(temp_password),
        )
        self.db.add(user)
        await self.db.flush()
        logger.info(
            "Admin registration created portal account for %s (%s) — temporary password: %s",
            full_name,
            email,
            temp_password,
        )
        return user, temp_password

    async def get_registration_fee(self, student_id: str) -> RegistrationFeeResponse:
        """Parent-facing registration fee for a child.

        Looks up the ACTIVE 'Registration' fee structure for the child's grade
        in the current academic year. paid is True only when the child has
        outstanding balances for that fee's schedules AND every balance is
        settled (status == paid / balance <= 0). No fee configured, no
        schedules generated, or any unsettled balance => unpaid.
        """
        student = await self.get_or_raise(student_id)
        year = datetime.now(UTC).year
        stmt = (
            select(FeeStructure)
            .where(
                FeeStructure.grade_id == student.grade_id,
                FeeStructure.academic_year == year,
                FeeStructure.category == "Registration",
                FeeStructure.is_active == True,  # noqa: E712
            )
            .order_by(FeeStructure.created_at.desc())
            .limit(1)
        )
        fee = (await self.db.execute(stmt)).scalar_one_or_none()
        if not fee:
            return RegistrationFeeResponse(configured=False)

        sched_stmt = select(MonthlySchedule).where(
            MonthlySchedule.fee_structure_id == fee.id
        )
        schedules = list((await self.db.execute(sched_stmt)).scalars().all())
        if not schedules:
            return RegistrationFeeResponse(
                configured=True, amount=fee.annual_amount, paid=False
            )

        bal_stmt = select(OutstandingBalance).where(
            OutstandingBalance.student_id == student_id,
            OutstandingBalance.monthly_schedule_id.in_([s.id for s in schedules]),
        )
        balances = list((await self.db.execute(bal_stmt)).scalars().all())
        if not balances:
            return RegistrationFeeResponse(
                configured=True, amount=fee.annual_amount, paid=False
            )
        paid = all(
            (b.status == "paid" or b.balance <= 0) for b in balances
        )
        return RegistrationFeeResponse(
            configured=True, amount=fee.annual_amount, paid=paid
        )

    async def get(self, student_id: str) -> Student | None:
        return await self.db.get(Student, student_id)

    async def get_or_raise(self, student_id: str) -> Student:
        student = await self.db.get(Student, student_id)
        if not student:
            raise NotFoundError("Student", student_id)
        return student

    async def get_by_number(self, student_number: str) -> Student | None:
        stmt = select(Student).where(Student.student_number == student_number)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_parent(
        self, parent_id: str, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Student]:
        stmt = (
            select(Student)
            .where(Student.parent_id == parent_id, Student.is_active == True)  # noqa: E712
            .order_by(Student.last_name)
            .limit(limit)
            .offset(offset)
        )
        stmt = _apply_search(stmt, search)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_parent(self, parent_id: str, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Student).where(
            Student.parent_id == parent_id, Student.is_active == True  # noqa: E712
        )
        stmt = _apply_search(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def list_by_grade(
        self, grade_id: str, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Student]:
        stmt = (
            select(Student)
            .where(Student.grade_id == grade_id, Student.is_active == True)  # noqa: E712
            .order_by(Student.last_name)
            .limit(limit)
            .offset(offset)
        )
        stmt = _apply_search(stmt, search)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_grade(self, grade_id: str, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Student).where(
            Student.grade_id == grade_id, Student.is_active == True  # noqa: E712
        )
        stmt = _apply_search(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def list_all(
        self, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Student]:
        stmt = (
            select(Student)
            .where(Student.is_active == True)  # noqa: E712
            .order_by(Student.last_name)
            .limit(limit)
            .offset(offset)
        )
        stmt = _apply_search(stmt, search)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_all(self, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Student).where(
            Student.is_active == True  # noqa: E712
        )
        stmt = _apply_search(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def list_recent(self, limit: int = 20) -> list[Student]:
        stmt = (
            select(Student)
            .order_by(Student.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_pending(self, limit: int = 50) -> list[Student]:
        stmt = (
            select(Student)
            .where(Student.registration_status == "pending")
            .order_by(Student.created_at.asc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def set_registration_status(self, student_id: str, status: str) -> Student | None:
        """Set registration_status (pending|approved|rejected) for admin approvals."""
        student = await self.get(student_id)
        if not student:
            return None
        student.registration_status = status
        if status == "rejected":
            student.is_active = False
        elif status == "approved" and not student.is_active:
            student.is_active = True
        await self.db.flush()
        return student

    async def update_guardian(
        self, student_id: str, guardian_id: str, data: GuardianUpdate
    ) -> StudentGuardian | None:
        """Update a guardian contact record. Parent can update details of the
        guardians on their own children."""
        student = await self.get_or_raise(student_id)
        guardian = next(
            (g for g in student.guardians if g.id == guardian_id), None
        )
        if not guardian:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(guardian, key, value)
        # Keep the denormalized full_name in sync when split names are edited.
        if guardian.first_name and guardian.last_name:
            guardian.full_name = f"{guardian.first_name} {guardian.last_name}".strip()
        await self.db.flush()
        return guardian

    async def update(self, student_id: str, data: StudentUpdate) -> Student | None:
        student = await self.get(student_id)
        if not student:
            return None
        payload = data.model_dump(exclude_unset=True)
        guardians_data = payload.pop("guardians", None)
        for key, value in payload.items():
            setattr(student, key, value)
        # Update guardian records in the same call (admin edit form sends both).
        if guardians_data:
            for gdata in guardians_data:
                gid = gdata.get("guardian_id")
                if not gid:
                    continue
                guardian = next((g for g in student.guardians if g.id == gid), None)
                if not guardian:
                    continue
                for key, value in gdata.items():
                    if key == "guardian_id" or value is None:
                        continue
                    setattr(guardian, key, value)
                # Keep the denormalized full_name in sync when split names are edited.
                if guardian.first_name and guardian.last_name:
                    guardian.full_name = f"{guardian.first_name} {guardian.last_name}".strip()
        await self.db.flush()
        return student

    async def deactivate(self, student_id: str) -> bool:
        student = await self.get(student_id)
        if not student:
            return False
        student.is_active = False
        await self.db.flush()
        return True
