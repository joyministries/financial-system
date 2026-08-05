import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        user_id: str,
        old_values: dict | None = None,
        new_values: dict | None = None,
    ) -> None:
        entry = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            old_values=json.dumps(old_values) if old_values else None,
            new_values=json.dumps(new_values) if new_values else None,
        )
        self.db.add(entry)
        await self.db.flush()
