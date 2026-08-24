from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.money import to_decimal
from app.models.grade import Student
from app.models.payment import Payment, PaymentAllocation, PaymentReversal
from app.models.schedule import AdditionalCharge, OutstandingBalance
from app.schemas.payment import (
    PaymentAllocationCreate,
    PaymentCreate,
    PaymentDeallocate,
    PaymentEdit,
    PaymentReallocate,
    PaymentReversalCreate,
)


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_payment(self, data: PaymentCreate, user_id: str) -> Payment:
        payment = Payment(
            **data.model_dump(),
            status="pending",
            allocated_by=user_id,
        )
        self.db.add(payment)
        await self.db.flush()
        return payment

    async def get(self, payment_id: str) -> Payment | None:
        return await self.db.get(Payment, payment_id)

    async def get_by_pay_code(self, pay_code: str) -> Payment | None:
        result = await self.db.execute(select(Payment).where(Payment.pay_code == pay_code))
        return result.scalar_one_or_none()

    def _month_filter(self, month: int | None = None, year: int | None = None):
        """Optional calendar-month/year filter for payment_date columns."""
        from sqlalchemy import extract

        conds = []
        if month is not None:
            conds.append(extract("month", Payment.payment_date) == month)
        if year is not None:
            conds.append(extract("year", Payment.payment_date) == year)
        return conds

    def _search_join(self, stmt, search: str | None = None):
        """Join to Student and filter by name/number when a search term is given."""
        if not search:
            return stmt
        term = f"%{search.strip()}%"
        return stmt.join(Student, Payment.student_id == Student.id).where(
            or_(
                Student.first_name.ilike(term),
                Student.last_name.ilike(term),
                Student.student_number.ilike(term),
            )
        )

    async def list_for_student(
        self,
        student_id: str,
        limit: int = 50,
        offset: int = 0,
        month: int | None = None,
        year: int | None = None,
    ) -> list[Payment]:
        stmt = (
            select(Payment)
            .where(Payment.student_id == student_id, *self._month_filter(month, year))
            .order_by(Payment.payment_date.desc(), Payment.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_for_students(
        self,
        student_ids: list[str],
        limit: int = 50,
        offset: int = 0,
        month: int | None = None,
        year: int | None = None,
        search: str | None = None,
    ) -> list[Payment]:
        stmt = select(Payment).where(
            Payment.student_id.in_(student_ids), *self._month_filter(month, year)
        )
        stmt = self._search_join(stmt, search)
        stmt = (
            stmt.order_by(Payment.payment_date.desc(), Payment.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_pending(
        self,
        limit: int = 50,
        offset: int = 0,
        month: int | None = None,
        year: int | None = None,
        search: str | None = None,
    ) -> list[Payment]:
        stmt = select(Payment).where(
            Payment.status == "pending", *self._month_filter(month, year)
        )
        stmt = self._search_join(stmt, search)
        stmt = stmt.order_by(Payment.payment_date, Payment.id).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_all(
        self,
        limit: int = 50,
        offset: int = 0,
        month: int | None = None,
        year: int | None = None,
        search: str | None = None,
    ) -> list[Payment]:
        stmt = select(Payment).where(*self._month_filter(month, year))
        stmt = self._search_join(stmt, search)
        stmt = (
            stmt.order_by(Payment.payment_date.desc(), Payment.id.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_student(
        self, student_id: str, month: int | None = None, year: int | None = None
    ) -> int:
        stmt = select(func.count()).select_from(Payment).where(
            Payment.student_id == student_id, *self._month_filter(month, year)
        )
        return int((await self.db.execute(stmt)).scalar_one())

    async def count_for_students(
        self,
        student_ids: list[str],
        month: int | None = None,
        year: int | None = None,
        search: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Payment).where(
            Payment.student_id.in_(student_ids), *self._month_filter(month, year)
        )
        stmt = self._search_join(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def count_pending(
        self, month: int | None = None, year: int | None = None, search: str | None = None
    ) -> int:
        stmt = select(func.count()).select_from(Payment).where(
            Payment.status == "pending", *self._month_filter(month, year)
        )
        stmt = self._search_join(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def count_all(
        self, month: int | None = None, year: int | None = None, search: str | None = None
    ) -> int:
        stmt = select(func.count()).select_from(Payment).where(
            *self._month_filter(month, year)
        )
        stmt = self._search_join(stmt, search)
        return int((await self.db.execute(stmt)).scalar_one())

    async def allocate(self, data: PaymentAllocationCreate) -> PaymentAllocation:
        payment = await self.get(data.payment_id)
        if not payment:
            raise NotFoundError("Payment", data.payment_id)
        if payment.status == "reversed":
            raise BusinessRuleError("Cannot allocate against a reversed payment")

        # Validate allocation doesn't exceed the target's remaining balance
        if data.outstanding_balance_id:
            await self._validate_balance_allocation(
                data.outstanding_balance_id, data.amount_allocated
            )
        if data.additional_charge_id:
            await self._validate_charge_allocation(data.additional_charge_id, data.amount_allocated)

        allocation = PaymentAllocation(
            payment_id=data.payment_id,
            outstanding_balance_id=data.outstanding_balance_id,
            additional_charge_id=data.additional_charge_id,
            amount_allocated=data.amount_allocated,
        )
        self.db.add(allocation)

        if data.outstanding_balance_id:
            await self._apply_to_balance(data.outstanding_balance_id, data.amount_allocated)

        if data.additional_charge_id:
            await self._apply_to_charge(data.additional_charge_id, data.amount_allocated)

        await self.db.flush()
        return allocation

    async def _validate_balance_allocation(self, balance_id: str, amount: Decimal) -> None:
        balance = await self.db.get(OutstandingBalance, balance_id)
        if not balance:
            raise NotFoundError("OutstandingBalance", balance_id)
        if balance.status == "paid":
            raise BusinessRuleError("Balance is already fully paid")
        remaining = to_decimal(
            balance.original_amount + balance.rollover_amount - balance.amount_paid
        )
        if amount > remaining:
            raise BusinessRuleError(
                f"Allocation of {amount} exceeds remaining balance of {remaining}"
            )

    async def _validate_charge_allocation(self, charge_id: str, amount: Decimal) -> None:
        charge = await self.db.get(AdditionalCharge, charge_id)
        if not charge:
            raise NotFoundError("AdditionalCharge", charge_id)
        if charge.is_paid:
            raise BusinessRuleError("Charge is already paid")
        if amount > charge.amount:
            raise BusinessRuleError(
                f"Allocation of {amount} exceeds charge amount of {charge.amount}"
            )

    async def _apply_to_balance(self, balance_id: str, amount: Decimal) -> None:
        balance = await self.db.get(OutstandingBalance, balance_id)
        if not balance:
            raise NotFoundError("OutstandingBalance", balance_id)

        balance.amount_paid = to_decimal(balance.amount_paid + amount)
        balance.balance = to_decimal(
            balance.original_amount + balance.rollover_amount - balance.amount_paid
        )
        balance.status = "paid" if balance.balance <= 0 else "partial"
        self.db.add(balance)

        # Mark the schedule entry as paid when the balance is cleared
        if balance.status == "paid":
            from app.models.schedule import MonthlySchedule

            schedule = await self.db.get(MonthlySchedule, balance.monthly_schedule_id)
            if schedule and not schedule.is_paid:
                schedule.is_paid = True
                self.db.add(schedule)

    async def _apply_to_charge(self, charge_id: str, amount: Decimal) -> None:
        charge = await self.db.get(AdditionalCharge, charge_id)
        if not charge:
            raise NotFoundError("AdditionalCharge", charge_id)

        remaining = charge.amount - amount
        if remaining <= 0:
            charge.is_paid = True
        self.db.add(charge)

    async def verify_payment(self, payment_id: str, action: str, user_id: str) -> Payment | None:
        payment = await self.get(payment_id)
        if not payment or payment.status != "pending":
            return None

        if action == "approve":
            payment.status = "verified"
        elif action == "reject":
            payment.status = "rejected"

        await self.db.flush()
        return payment

    async def reverse(self, data: PaymentReversalCreate, user_id: str) -> PaymentReversal:
        payment = await self.get(data.payment_id)
        if not payment:
            raise NotFoundError("Payment", data.payment_id)
        if payment.status == "reversed":
            raise BusinessRuleError("Payment already reversed")

        reversal = PaymentReversal(
            payment_id=data.payment_id,
            reversed_by=user_id,
            reason=data.reason,
        )
        self.db.add(reversal)
        payment.status = "reversed"

        stmt = select(PaymentAllocation).where(PaymentAllocation.payment_id == data.payment_id)
        result = await self.db.execute(stmt)
        allocations = result.scalars().all()

        for alloc in allocations:
            await self._reverse_allocation(alloc)
            await self.db.delete(alloc)

        await self.db.flush()
        return reversal

    async def _reverse_allocation(self, alloc: PaymentAllocation) -> None:
        if alloc.outstanding_balance_id:
            balance = await self.db.get(OutstandingBalance, alloc.outstanding_balance_id)
            if balance:
                balance.amount_paid = to_decimal(balance.amount_paid - alloc.amount_allocated)
                balance.balance = to_decimal(
                    balance.original_amount + balance.rollover_amount - balance.amount_paid
                )
                balance.status = "pending" if balance.balance > 0 else "paid"
                self.db.add(balance)

        if alloc.additional_charge_id:
            charge = await self.db.get(AdditionalCharge, alloc.additional_charge_id)
            if charge:
                charge.is_paid = False
                self.db.add(charge)

    async def upload_proof(self, payment_id: str, proof_url: str) -> Payment | None:
        payment = await self.get(payment_id)
        if not payment:
            return None
        payment.proof_of_payment_url = proof_url
        await self.db.flush()
        return payment

    # ── Edit / reallocate ──────────────────────────────────────────────

    async def edit(self, payment_id: str, data: PaymentEdit) -> Payment:
        """Admin can correct payment details.  Changing student_id or amount
        is only allowed when the payment has no allocations yet."""
        payment = await self.get(payment_id)
        if not payment:
            raise NotFoundError("Payment", payment_id)

        # Check if payment has allocations
        stmt = select(func.count()).select_from(PaymentAllocation).where(
            PaymentAllocation.payment_id == payment_id
        )
        alloc_count = int((await self.db.execute(stmt)).scalar_one())

        if alloc_count > 0:
            # If changing student or amount, require deallocation first
            if data.student_id and data.student_id != payment.student_id:
                raise BusinessRuleError(
                    "Cannot change student on an allocated payment. "
                    "Deallocate all allocations first."
                )
            if data.amount and data.amount != payment.amount:
                raise BusinessRuleError(
                    "Cannot change amount on an allocated payment. "
                    "Deallocate all allocations first."
                )

        # Apply allowed fields
        if data.student_id is not None:
            payment.student_id = data.student_id
        if data.amount is not None:
            payment.amount = data.amount
        if data.payment_method is not None:
            payment.payment_method = data.payment_method
        if data.payment_date is not None:
            payment.payment_date = data.payment_date
        if data.reference_number is not None:
            payment.reference_number = data.reference_number
        if data.notes is not None:
            payment.notes = data.notes

        await self.db.flush()
        return payment

    async def deallocate(self, allocation_id: str) -> PaymentAllocation:
        """Remove a single allocation and reverse its effect on the balance/charge."""
        alloc = await self.db.get(PaymentAllocation, allocation_id)
        if not alloc:
            raise NotFoundError("PaymentAllocation", allocation_id)

        # Reverse the allocation's effect
        await self._reverse_allocation(alloc)
        await self.db.delete(alloc)
        await self.db.flush()
        return alloc

    async def reallocate(self, data: PaymentReallocate) -> PaymentAllocation:
        """Move funds from one allocation target to another on the same payment."""
        payment = await self.get(data.payment_id)
        if not payment:
            raise NotFoundError("Payment", data.payment_id)
        if payment.status == "reversed":
            raise BusinessRuleError("Cannot reallocate a reversed payment")

        # If a source allocation is specified, reverse it first
        if data.source_allocation_id:
            source_alloc = await self.db.get(PaymentAllocation, data.source_allocation_id)
            if not source_alloc:
                raise NotFoundError("PaymentAllocation", data.source_allocation_id)
            if source_alloc.payment_id != data.payment_id:
                raise BusinessRuleError("Source allocation does not belong to this payment")

            # Use the amount from the source allocation if not overridden
            amount = data.amount if data.amount else source_alloc.amount_allocated
            if amount > source_alloc.amount_allocated:
                raise BusinessRuleError(
                    f"Requested amount {amount} exceeds source allocation of "
                    f"{source_alloc.amount_allocated}"
                )

            await self._reverse_allocation(source_alloc)

            # If partial deallocation, re-allocate the remainder back
            remainder = source_alloc.amount_allocated - amount
            if remainder > 0:
                await self._allocate_without_check(
                    payment, source_alloc.outstanding_balance_id,
                    source_alloc.additional_charge_id, remainder,
                )
        else:
            amount = data.amount

        # Create new allocation
        new_alloc = await self._allocate_without_check(
            payment,
            data.target_outstanding_balance_id,
            data.target_additional_charge_id,
            amount,
        )
        await self.db.flush()
        return new_alloc

    async def _allocate_without_check(
        self,
        payment: Payment,
        balance_id: str | None,
        charge_id: str | None,
        amount: Decimal,
    ) -> PaymentAllocation:
        """Internal: create an allocation with balance/charge updates (no validation)."""
        allocation = PaymentAllocation(
            payment_id=payment.id,
            outstanding_balance_id=balance_id,
            additional_charge_id=charge_id,
            amount_allocated=amount,
        )
        self.db.add(allocation)

        if balance_id:
            await self._apply_to_balance(balance_id, amount)
        if charge_id:
            await self._apply_to_charge(charge_id, amount)

        return allocation
