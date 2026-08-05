import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError
from app.models.financial import Receipt
from app.models.payment import Payment


class ReceiptService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate(self, payment: Payment) -> Receipt:
        if not payment.allocated_by:
            raise BusinessRuleError(
                "Cannot generate receipt: payment has no allocator assigned"
            )

        receipt_number = f"RCP-{uuid.uuid4().hex[:8].upper()}"
        receipt = Receipt(
            receipt_number=receipt_number,
            payment_id=payment.id,
            student_id=payment.student_id,
            amount=payment.amount,
            payment_method=payment.payment_method,
            allocated_by=payment.allocated_by,
        )
        self.db.add(receipt)
        await self.db.flush()
        return receipt

    async def get(self, receipt_id: str) -> Receipt | None:
        return await self.db.get(Receipt, receipt_id)

    async def get_by_number(self, receipt_number: str) -> Receipt | None:
        stmt = select(Receipt).where(Receipt.receipt_number == receipt_number)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_student(
        self, student_id: str, limit: int = 50, offset: int = 0
    ) -> list[Receipt]:
        stmt = (
            select(Receipt)
            .where(Receipt.student_id == student_id)
            .order_by(Receipt.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_all(
        self,
        student_ids: list[str] | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        payment_method: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Receipt]:
        stmt = select(Receipt)

        if student_ids is not None:
            if not student_ids:
                return []
            stmt = stmt.where(Receipt.student_id.in_(student_ids))
        if payment_method:
            stmt = stmt.where(Receipt.payment_method == payment_method)
        if start_date:
            stmt = stmt.where(Receipt.created_at >= start_date)
        if end_date:
            stmt = stmt.where(Receipt.created_at <= end_date)

        stmt = stmt.order_by(Receipt.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
