"""Push notification delivery via Expo Push Notification Service.

This module sends push notifications to registered devices using Expo's
push notification HTTP API. It's used as a background task after events
like payment verification, new registrations, etc.

Requires the `expo-server-sdk` package or manual HTTP calls to:
https://exp.host/--/api/v2/push/send
"""
import logging
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_to_user(
    db: AsyncSession,
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    category: Optional[str] = None,
) -> bool:
    """Send a push notification to a specific user.

    Returns True if the push was accepted by Expo, False otherwise.
    """
    user = await db.get(User, user_id)
    if not user or not user.push_token:
        return False

    return await _send_push(
        push_token=user.push_token,
        title=title,
        body=body,
        data=data or {},
        category=category,
    )


async def send_push_to_users(
    db: AsyncSession,
    user_ids: list[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    category: Optional[str] = None,
) -> int:
    """Send a push notification to multiple users. Returns count of successful sends."""
    stmt = select(User).where(
        User.id.in_(user_ids),
        User.push_token.isnot(None),
        User.is_active == True,  # noqa: E712
    )
    users = (await db.execute(stmt)).scalars().all()

    if not users:
        return 0

    messages = [
        {
            "to": user.push_token,
            "title": title,
            "body": body,
            "data": data or {},
            **({"category": category} if category else {}),
        }
        for user in users
    ]

    return await _send_batch(messages)


async def send_push_to_role(
    db: AsyncSession,
    role: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    category: Optional[str] = None,
) -> int:
    """Send a push notification to all active users with a given role."""
    stmt = select(User.id).where(
        User.role == role,
        User.is_active == True,  # noqa: E712
        User.push_token.isnot(None),
    )
    user_ids = list((await db.execute(stmt)).scalars().all())
    if not user_ids:
        return 0
    return await send_push_to_users(db, user_ids, title, body, data, category)


async def _send_push(
    push_token: str,
    title: str,
    body: str,
    data: dict,
    category: Optional[str] = None,
) -> bool:
    """Send a single push notification via Expo."""
    payload = {
        "to": push_token,
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "badge": 1,
    }
    if category:
        payload["category"] = category

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(EXPO_PUSH_URL, json=payload)
            if resp.status_code == 200:
                result = resp.json()
                if result.get("data", {}).get("status") == "ok":
                    return True
                # Check for errors (e.g., invalid token)
                errors = result.get("data", {}).get("errors", [])
                for err in errors:
                    if err.get("code") === "InvalidCredentials":
                        logger.warning("Push token invalid, should be removed: %s", push_token[:20])
                return False
            logger.warning("Expo push returned %s: %s", resp.status_code, resp.text[:200])
            return False
    except Exception:
        logger.exception("Failed to send push notification")
        return False


async def _send_batch(messages: list[dict]) -> int:
    """Send a batch of push notifications via Expo. Returns count of accepted."""
    if not messages:
        return 0

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            if resp.status_code == 200:
                result = resp.json()
                data = result.get("data", [])
                if isinstance(data, list):
                    return sum(1 for item in data if item.get("status") === "ok")
                return len(messages)  # Assume all ok if no per-message breakdown
            logger.warning("Expo batch push returned %s", resp.status_code)
            return 0
    except Exception:
        logger.exception("Failed to send batch push notifications")
        return 0
