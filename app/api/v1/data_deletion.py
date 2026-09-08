"""Data deletion (POPIA erasure) flow.

Parents exercise their data-erasure right through a public, rate-limited
form; the request lands in an admin queue; approving it deactivates the
account and anonymises the PII in place (financial records are statutory
and are retained).

PUBLIC endpoint (documented exception to the auth-first rule):
  POST /data-deletion/requests — public form, rate limited, generic
  acknowledgement so the response never reveals whether an email exists.
"""

import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.models.data_deletion import DataDeletionRequest
from app.models.grade import StudentGuardian
from app.models.user import User
from app.schemas.common import build_page_response
from app.schemas.data_deletion import (
    DataDeletionRequestAcknowledgement,
    DataDeletionRequestCreate,
    DataDeletionRequestListResponse,
    DataDeletionRequestResponse,
    RejectionReason,
)
from app.services.audit import AuditService
from app.services.notification import NotificationService

router = APIRouter(prefix="/data-deletion", tags=["Data Deletion"])

# Generic acknowledgement returned for BOTH "found" and "not found" so the
# public form cannot be used to confirm which emails have accounts.
_ACK = DataDeletionRequestAcknowledgement(
    detail="Your request has been received. The school will process it "
    "within 10 working days, and your account and personal data will be "
    "removed once approved."
)


@router.post(
    "/requests",
    response_model=DataDeletionRequestAcknowledgement,
    summary="Submit a data-deletion request (public)",
)
@limiter.limit("10/hour")
async def create_deletion_request(
    request: Request,
    data: DataDeletionRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Public form: any data subject may request erasure.

    Public endpoint (documented) — requires no authentication so a parent
    can ask for their data to be removed even after losing access. Rate
    limited per IP. The response is identical whether or not an account with
    that email exists (no account enumeration).
    """
    stmt = select(User).where(User.email == data.email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    # Only parent accounts go through this flow — staff accounts are managed
    # by the super admin. Silently no-op otherwise (same acknowledgement).
    if user is None or user.role != "parent":
        return _ACK

    # Idempotent: never pile up duplicate pending requests for the same user.
    dup = (
        await db.execute(
            select(DataDeletionRequest.id).where(
                DataDeletionRequest.user_id == user.id,
                DataDeletionRequest.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if dup:
        return _ACK

    deletion_request = DataDeletionRequest(
        user_id=user.id,
        email=user.email,
        reason=data.reason,
    )
    db.add(deletion_request)
    await db.flush()

    notify = NotificationService(db)
    await notify.notify_staff(
        title="Account deletion requested",
        message=(
            f"{user.full_name} ({user.email}) has requested that their "
            "account and personal data be deleted. Review it in the "
            "Deletion Requests queue."
        ),
        category="system",
        entity_type="data_deletion_request",
        entity_id=deletion_request.id,
    )
    return _ACK


@router.get("/requests", response_model=DataDeletionRequestListResponse)
async def list_deletion_requests(
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin queue of deletion requests (oldest first)."""
    base = select(DataDeletionRequest)
    count_stmt = select(func.count()).select_from(DataDeletionRequest)
    if status:
        base = base.where(DataDeletionRequest.status == status)
        count_stmt = count_stmt.where(DataDeletionRequest.status == status)

    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(
            base.order_by(DataDeletionRequest.created_at.asc(), DataDeletionRequest.id.asc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    # Attach the account display name for the queue (best-effort).
    user_ids = [r.user_id for r in rows]
    names = {}
    if user_ids:
        stmt = select(User.id, User.full_name).where(User.id.in_(user_ids))
        for uid, name in (await db.execute(stmt)).all():
            names[uid] = name

    items = [
        DataDeletionRequestResponse(
            id=r.id,
            user_id=r.user_id,
            email=r.email,
            user_full_name=names.get(r.user_id),
            reason=r.reason,
            status=r.status,
            decided_by=r.decided_by,
            decided_at=r.decided_at.isoformat() if r.decided_at else None,
            rejection_reason=r.rejection_reason,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
    return build_page_response(items, total, limit, offset)


@router.post(
    "/requests/{request_id}/approve",
    response_model=DataDeletionRequestResponse,
)
async def approve_deletion_request(
    request_id: str,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate + anonymise the parent account and close the request.

    Financial records are NOT deleted — payments, invoices, receipts,
    statements and charges are statutory records retained for audit/tax
    purposes. The account PII (email, name, phone, push token, password)
    is replaced so the data subject can no longer be identified or logged
    in. Guardian contact rows carrying the deleted email are also cleared.
    """
    deletion_request = await db.get(DataDeletionRequest, request_id)
    if not deletion_request or deletion_request.status != "pending":
        raise HTTPException(status_code=404, detail="No pending deletion request found")

    user = await db.get(User, deletion_request.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Account no longer exists")
    if user.role != "parent":
        raise HTTPException(
            status_code=400,
            detail="Only parent accounts can be erased through this flow "
            "(manage staff accounts under Staff Accounts)",
        )

    old_email = user.email
    anon_id = secrets.token_urlsafe(16)
    user.email = f"anon-{anon_id}@invalid"
    user.full_name = "Deleted Parent"
    user.phone = None
    user.push_token = None
    user.is_active = False
    # Rotate the hash so the old password can never be used even if the
    # account were ever re-activated.
    user.hashed_password = hash_password(secrets.token_urlsafe(24))
    user.must_change_password = False
    await db.flush()

    # Remove the requester's contact PII from any guardian rows carrying
    # their email. Names and student/financial records are kept intact.
    clear = (
        update(StudentGuardian)
        .where(StudentGuardian.email == old_email)
        .values(email=None, phone=None, physical_address=None, po_box=None)
    )
    await db.execute(clear)

    deletion_request.status = "approved"
    deletion_request.decided_by = admin.id
    deletion_request.decided_at = datetime.now(UTC)
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "data_deletion_request",
        deletion_request.id,
        "approve_deletion",
        admin.id,
        old_values={"user_id": user.id, "role": user.role},
        new_values={
            "status": "approved",
            "email_anonymized": True,
            "account_deactivated": True,
        },
    )
    return DataDeletionRequestResponse(
        id=deletion_request.id,
        user_id=deletion_request.user_id,
        email=deletion_request.email,
        user_full_name=None,
        reason=deletion_request.reason,
        status=deletion_request.status,
        decided_by=deletion_request.decided_by,
        decided_at=deletion_request.decided_at.isoformat(),
        rejection_reason=deletion_request.rejection_reason,
        created_at=deletion_request.created_at.isoformat(),
    )


@router.post(
    "/requests/{request_id}/reject",
    response_model=DataDeletionRequestResponse,
)
async def reject_deletion_request(
    request_id: str,
    body: RejectionReason,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Reject a deletion request (e.g. the account does not exist, or the
    school must keep the data). No account change is made."""
    deletion_request = await db.get(DataDeletionRequest, request_id)
    if not deletion_request or deletion_request.status != "pending":
        raise HTTPException(status_code=404, detail="No pending deletion request found")

    deletion_request.status = "rejected"
    deletion_request.decided_by = admin.id
    deletion_request.decided_at = datetime.now(UTC)
    deletion_request.rejection_reason = body.reason
    await db.flush()

    audit = AuditService(db)
    await audit.log(
        "data_deletion_request",
        deletion_request.id,
        "reject_deletion",
        admin.id,
        old_values={"user_id": deletion_request.user_id},
        new_values={"status": "rejected", "reason": body.reason},
    )
    return DataDeletionRequestResponse(
        id=deletion_request.id,
        user_id=deletion_request.user_id,
        email=deletion_request.email,
        user_full_name=None,
        reason=deletion_request.reason,
        status=deletion_request.status,
        decided_by=deletion_request.decided_by,
        decided_at=deletion_request.decided_at.isoformat(),
        rejection_reason=deletion_request.rejection_reason,
        created_at=deletion_request.created_at.isoformat(),
    )