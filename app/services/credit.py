from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.money import to_decimal
from app.models.credit import CreditNote
from app.models.grade import Student
from app.models.schedule import OutstandingBalance
from app.schemas.credit import CreditNoteVoid
from app.services.audit import AuditService

CREDIT_TYPE_MAX = 50


class CreditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    async def _next_credit_number(self) -> str:
        """Generate a sequential credit number: CN-{year}-{sequence:05d}."""
        year = datetime.now(UTC).year
        prefix = f"CN-{year}-"
        count = await self.db.scalar(
            select(func.count(CreditNote.id)).where(CreditNote.credit_number.like(f"{prefix}%"))
        )
        return f"{prefix}{int(count or 0) + 1:05d}"

    async def _list_open_outstanding(self, student_id: str) -> list[OutstandingBalance]:
        result = await self.db.execute(
            select(OutstandingBalance)
            .where(
                OutstandingBalance.student_id == student_id,
                OutstandingBalance.balance > 0,
                OutstandingBalance.status == "pending",
            )
            .order_by(OutstandingBalance.created_at.asc())
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Issue
    # ------------------------------------------------------------------
    async def issue(
        self,
        student_id: str,
        credit_type: str,
        description: str,
        amount: Decimal,
        issued_by: str,
        auto_apply: bool = True,
    ) -> CreditNote:
        """Issue a credit note against a student's fee account.

        When ``auto_apply`` is true the credit is applied immediately against
        the student's oldest outstanding balances, reducing what they owe.
        """
        amount = to_decimal(amount)
        student = await self.db.get(Student, student_id)
        if student is None:
            raise NotFoundError("Student", student_id)

        credit_type = (credit_type or "adjustment").strip()[:CREDIT_TYPE_MAX]
        if not credit_type:
            raise BusinessRuleError("Credit type is required")

        credit_number = await self._next_credit_number()
        credit = CreditNote(
            credit_number=credit_number,
            student_id=student_id,
            credit_type=credit_type,
            description=description,
            amount=amount,
            status="issued",
            remaining_amount=amount,
            issued_by=issued_by,
        )
        self.db.add(credit)
        await self.db.flush()

        if auto_apply:
            await self._apply_credit(
                credit, applied_by=issued_by, reason=f"Auto-applied on issue ({credit_number})"
            )

        await AuditService(self.db).log(
            entity_type="credit_note",
            entity_id=credit.id,
            action="credit_note.issue",
            user_id=issued_by,
            new_values={
                "credit_number": credit.credit_number,
                "student_id": student_id,
                "credit_type": credit.credit_type,
                "amount": str(credit.amount),
            },
        )
        await self.db.commit()
        await self.db.refresh(credit)
        return credit

    # ------------------------------------------------------------------
    # Apply against outstanding balances
    # ------------------------------------------------------------------
    async def _apply_credit(
        self, credit: CreditNote, applied_by: str, reason: str = "Applied"
    ) -> Decimal:
        """Apply ``credit.remaining_amount`` against the student's outstanding balances."""
        if credit.status == "voided":
            raise BusinessRuleError("Cannot apply a voided credit note")
        if credit.remaining_amount <= 0:
            raise BusinessRuleError("Credit note has no remaining value")

        remaining = credit.remaining_amount
        open_balances = await self._list_open_outstanding(credit.student_id)

        applied_total = Decimal("0")
        for ob in open_balances:
            if remaining <= 0:
                break
            apply_amt = min(remaining, ob.balance)
            ob.balance = to_decimal(ob.balance - apply_amt)
            ob.amount_paid = to_decimal(ob.amount_paid + apply_amt)
            if ob.balance <= 0:
                ob.balance = Decimal("0")
                ob.status = "paid"
            applied_total += apply_amt
            remaining -= apply_amt

        # Reflect application on the credit note itself
        credit.remaining_amount = to_decimal(remaining)
        if credit.remaining_amount <= 0:
            credit.status = "applied"
        elif applied_total > 0:
            credit.status = "partial"

        if applied_total > 0:
            await AuditService(self.db).log(
                entity_type="credit_note",
                entity_id=credit.id,
                action="credit_note.apply",
                user_id=applied_by,
                new_values={"applied_amount": str(applied_total), "reason": reason},
            )

        return applied_total

    async def apply(self, credit_id: str, user_id: str) -> CreditNote:
        """Manually apply a credit note's remaining value against outstanding balances."""
        credit = await self.db.get(CreditNote, credit_id)
        if credit is None:
            raise NotFoundError("CreditNote", credit_id)
        await self._apply_credit(credit, applied_by=user_id, reason="Manually applied")
        await self.db.commit()
        await self.db.refresh(credit)
        return credit

    # ------------------------------------------------------------------
    # Void
    # ------------------------------------------------------------------
    async def void(self, credit_id: str, data: CreditNoteVoid, user_id: str) -> CreditNote:
        """Void a credit note.

        Only credits with no applied value may be voided. If any portion has
        already been applied, voiding is disallowed to avoid breaking the
        ledger — the applied portion must first be reversed by an admin.
        """
        credit = await self.db.get(CreditNote, credit_id)
        if credit is None:
            raise NotFoundError("CreditNote", credit_id)
        if credit.status == "voided":
            raise BusinessRuleError("Credit note is already voided")
        if credit.status == "applied":
            raise BusinessRuleError(
                "Cannot void a fully-applied credit note; reverse the application instead"
            )
        if credit.remaining_amount < credit.amount:
            raise BusinessRuleError(
                "Cannot void a partially-applied credit note; reverse the applied portion first"
            )

        credit.status = "voided"
        credit.voided_by = user_id
        credit.void_reason = data.reason
        credit.voided_at = datetime.now(UTC)

        await AuditService(self.db).log(
            entity_type="credit_note",
            entity_id=credit.id,
            action="credit_note.void",
            user_id=user_id,
            new_values={"reason": data.reason, "credit_number": credit.credit_number},
        )
        await self.db.commit()
        await self.db.refresh(credit)
        return credit

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------
    async def list_for_student(self, student_id: str) -> list[CreditNote]:
        result = await self.db.execute(
            select(CreditNote)
            .where(CreditNote.student_id == student_id)
            .order_by(CreditNote.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_all(self, limit: int = 100, offset: int = 0) -> list[CreditNote]:
        result = await self.db.execute(
            select(CreditNote).order_by(CreditNote.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def get(self, credit_id: str) -> CreditNote:
        credit = await self.db.get(CreditNote, credit_id)
        if credit is None:
            raise NotFoundError("CreditNote", credit_id)
        return credit