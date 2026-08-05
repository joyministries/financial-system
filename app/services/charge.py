from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Student
from app.models.schedule import AdditionalCharge
from app.schemas.charge import AdditionalChargeCreate, GradeChargeCreate


class ChargeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: AdditionalChargeCreate) -> AdditionalCharge:
        charge = AdditionalCharge(**data.model_dump())
        self.db.add(charge)
        await self.db.flush()
        return charge

    async def create_for_grade(
        self, data: GradeChargeCreate
    ) -> list[AdditionalCharge]:
        """Apply one charge to every active student in the grade.

        Students listed in exclude_student_ids opt out — no row is created
        for them (e.g. a student not attending the excursion).
        """
        excluded = set(data.exclude_student_ids or [])
        stmt = select(Student.id).where(
            Student.grade_id == data.grade_id, Student.is_active == True  # noqa: E712
        )
        result = await self.db.execute(stmt)
        student_ids = [sid for sid in result.scalars().all() if sid not in excluded]

        if not student_ids:
            return []

        created = []
        for student_id in student_ids:
            charge = AdditionalCharge(
                grade_id=data.grade_id,
                student_id=student_id,
                charge_type=data.charge_type,
                description=data.description,
                amount=data.amount,
                academic_year=data.academic_year,
                month=data.month,
            )
            self.db.add(charge)
            created.append(charge)
        await self.db.flush()
        return created

    async def get(self, charge_id: str) -> AdditionalCharge | None:
        return await self.db.get(AdditionalCharge, charge_id)

    async def list_for_student(self, student_id: str, academic_year: int) -> list[AdditionalCharge]:
        stmt = (
            select(AdditionalCharge)
            .where(
                AdditionalCharge.student_id == student_id,
                AdditionalCharge.academic_year == academic_year,
            )
            .order_by(AdditionalCharge.month, AdditionalCharge.charge_type)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_unpaid(self, student_id: str, academic_year: int) -> list[AdditionalCharge]:
        stmt = (
            select(AdditionalCharge)
            .where(
                AdditionalCharge.student_id == student_id,
                AdditionalCharge.academic_year == academic_year,
                AdditionalCharge.is_paid == False,  # noqa: E712
            )
            .order_by(AdditionalCharge.month)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_paid(self, charge_id: str) -> bool:
        charge = await self.get(charge_id)
        if not charge:
            return False
        charge.is_paid = True
        await self.db.flush()
        return True

    async def delete(self, charge_id: str) -> bool:
        charge = await self.get(charge_id)
        if not charge:
            return False
        await self.db.delete(charge)
        await self.db.flush()
        return True
