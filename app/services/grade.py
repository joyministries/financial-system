from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.models.grade import FeeStructure, Grade
from app.schemas.grade import FeeStructureCreate, FeeStructureUpdate, GradeCreate, GradeUpdate


class GradeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: GradeCreate) -> Grade:
        grade = Grade(**data.model_dump())
        self.db.add(grade)
        await self.db.flush()
        return grade

    async def get(self, grade_id: str) -> Grade | None:
        return await self.db.get(Grade, grade_id)

    async def list(self, active_only: bool = True) -> list[Grade]:
        stmt = select(Grade)
        if active_only:
            stmt = stmt.where(Grade.is_active == True, Grade.is_archived == False)  # noqa: E712
        stmt = stmt.order_by(Grade.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, grade_id: str, data: GradeUpdate) -> Grade | None:
        grade = await self.get(grade_id)
        if not grade:
            return None
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(grade, key, value)
        await self.db.flush()
        return grade

    async def delete(self, grade_id: str) -> bool:
        grade = await self.get(grade_id)
        if not grade:
            return False
        grade.is_active = False
        await self.db.flush()
        return True

    async def archive(self, grade_id: str) -> Grade | None:
        grade = await self.get(grade_id)
        if not grade:
            return None
        grade.is_archived = True
        grade.is_active = False
        await self.db.flush()
        return grade

    async def activate(self, grade_id: str) -> Grade | None:
        grade = await self.get(grade_id)
        if not grade:
            return None
        grade.is_archived = False
        grade.is_active = True
        await self.db.flush()
        return grade


class FeeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: FeeStructureCreate) -> FeeStructure:
        self._validate_plan(data.payment_plan, data.monthly_installment)
        existing = await self.db.execute(
            select(FeeStructure).where(
                FeeStructure.grade_id == data.grade_id,
                FeeStructure.academic_year == data.academic_year,
                FeeStructure.category == data.category,
                FeeStructure.is_active == True,  # noqa: E712
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictError(
                f"Fee structure already exists for grade {data.grade_id}, "
                f"year {data.academic_year}, category '{data.category}'"
            )

        fee = FeeStructure(**data.model_dump())
        self.db.add(fee)
        await self.db.flush()
        return fee

    @staticmethod
    def _validate_plan(payment_plan: str | None, monthly_installment: Decimal | None) -> None:
        if payment_plan is None or payment_plan == "monthly":
            if monthly_installment is None:
                raise ValidationError(
                    "monthly_installment is required when payment_plan is 'monthly'"
                )
        elif payment_plan == "yearly":
            if monthly_installment is not None:
                raise ValidationError(
                    "monthly_installment is not used when payment_plan is 'yearly'"
                )

    async def update(self, fee_id: str, data: FeeStructureUpdate) -> FeeStructure | None:
        fee = await self.get(fee_id)
        if not fee:
            return None
        updates = data.model_dump(exclude_unset=True)
        new_plan = updates.get("payment_plan", fee.payment_plan)
        new_installment = updates.get("monthly_installment", fee.monthly_installment)
        self._validate_plan(new_plan, new_installment)
        for key, value in updates.items():
            setattr(fee, key, value)
        await self.db.flush()
        return fee

    async def get(self, fee_id: str) -> FeeStructure | None:
        return await self.db.get(FeeStructure, fee_id)

    async def list_by_grade(self, grade_id: str, academic_year: int) -> list[FeeStructure]:
        stmt = (
            select(FeeStructure)
            .where(
                FeeStructure.grade_id == grade_id,
                FeeStructure.academic_year == academic_year,
                FeeStructure.is_active == True,  # noqa: E712
            )
            .order_by(FeeStructure.category)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def deactivate(self, fee_id: str) -> bool:
        fee = await self.get(fee_id)
        if not fee:
            return False
        fee.is_active = False
        await self.db.flush()
        return True
