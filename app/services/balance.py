from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import to_decimal
from app.models.schedule import MonthlySchedule, OutstandingBalance
from app.services.schedule import ScheduleService


class BalanceEngine:
    """Handles outstanding balance rollover between months.

    Core rules:
    - Unpaid amounts roll into the next month's balance
    - Partial payments reduce the current balance; remainder rolls over
    - Overpayments zero out the balance (credit handling is out of scope)
    - Allocations target oldest month first
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.schedule_service = ScheduleService(db)

    async def apply_rollover(
        self, student_id: str, academic_year: int
    ) -> list[OutstandingBalance]:
        balances = await self.schedule_service.get_outstanding_for_student(
            student_id, academic_year
        )

        for balance in balances:
            if balance.status == "paid":
                continue
            if balance.rollover_amount > 0:
                balance.balance = to_decimal(
                    balance.original_amount + balance.rollover_amount - balance.amount_paid
                )
                self.db.add(balance)

        await self.db.flush()
        return balances

    async def calculate_total_due(self, student_id: str, academic_year: int) -> Decimal:
        balances = await self.schedule_service.get_outstanding_for_student(
            student_id, academic_year
        )
        total = sum(
            (b.balance for b in balances if b.status != "paid"),
            Decimal("0"),
        )
        # Unpaid additional charges are part of what the parent owes; the
        # monthly summary counts them the same way (full amount until paid).
        from app.services.charge import ChargeService

        unpaid_charges = await ChargeService(self.db).get_unpaid(
            student_id, academic_year
        )
        total += sum((c.amount for c in unpaid_charges), Decimal("0"))
        return to_decimal(total)

    async def process_rollover(self, academic_year: int) -> None:
        """End-of-month batch: propagate unpaid amounts forward to the next period."""
        pending = await self.schedule_service.get_all_pending(academic_year)

        # Resolve actual month numbers so we sort chronologically, not by UUID
        month_by_balance = await self._resolve_months(pending)

        by_student: dict[str, list[OutstandingBalance]] = {}
        for balance in pending:
            by_student.setdefault(balance.student_id, []).append(balance)

        for _student_id, balances in by_student.items():
            sorted_balances = sorted(
                balances, key=lambda b: month_by_balance.get(b.id, 0)
            )
            self._rollover_chain(sorted_balances)

        await self.db.flush()

    async def _resolve_months(
        self, balances: list[OutstandingBalance]
    ) -> dict[str, int]:
        """Build balance_id -> month mapping via the schedule table."""
        schedule_ids = {b.monthly_schedule_id for b in balances}
        if not schedule_ids:
            return {}

        stmt = select(MonthlySchedule.id, MonthlySchedule.month).where(
            MonthlySchedule.id.in_(schedule_ids)
        )
        result = await self.db.execute(stmt)
        schedule_to_month = {row.id: row.month for row in result.all()}

        return {
            b.id: schedule_to_month.get(b.monthly_schedule_id, 0)
            for b in balances
        }

    def _rollover_chain(self, sorted_balances: list[OutstandingBalance]) -> None:
        """Walk the balance chain: anything unpaid in month N gets added to month N+1."""
        for i, balance in enumerate(sorted_balances):
            if balance.status == "paid":
                continue

            unpaid = to_decimal(
                balance.original_amount + balance.rollover_amount - balance.amount_paid
            )

            if unpaid <= 0:
                balance.status = "paid"
                balance.balance = Decimal("0")
                self.db.add(balance)
                continue

            if i + 1 < len(sorted_balances):
                next_balance = sorted_balances[i + 1]
                next_balance.rollover_amount = to_decimal(
                    next_balance.rollover_amount + unpaid
                )
                self.db.add(next_balance)

            balance.balance = unpaid
            self.db.add(balance)
