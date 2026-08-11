"""PayFast payment gateway integration (redirect / off-site method).

Implements the PayFast custom payment integration:
https://developers.payfast.co.za/docs

Flow:
  1. Parent requests `POST /api/v1/payfast/initiate` for one of their children.
     The backend creates a `Payment` record (status=pending, method=payfast)
     and returns the PayFast process URL plus the hidden form fields
     (including the MD5 security signature).
  2. The frontend auto-submits the form; the payer is redirected to PayFast.
  3. PayFast redirects the browser back to `return_url` (success) or
     `cancel_url` — the ITN (server-to-server notification) to `notify_url`
     is the source of truth for the payment outcome.

Signature rules (see PayFast docs):
  * sort parameters alphabetically by key
  * exclude empty values
  * build "key=value&key=value" (no URL encoding beyond the plain values)
  * if a passphrase is configured, append "&passphrase=<passphrase>"
  * MD5, lowercase hex
"""
from __future__ import annotations

import hashlib
import logging
from decimal import Decimal
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# PayFast endpoint bases
_SANDBOX_PROCESS = "https://sandbox.payfast.co.za/eng/process"
_SANDBOX_VALIDATE = "https://sandbox.payfast.co.za/eng/query/validate"
_LIVE_PROCESS = "https://www.payfast.co.za/eng/process"
_LIVE_VALIDATE = "https://www.payfast.co.za/eng/query/validate"

# Documented PayFast ITN source IP ranges (advisory; server-side validation
# via /eng/query/validate is the authoritative check).
ITN_SOURCE_CIDRS = ["197.97.145.144/28"]

# Payment statuses PayFast reports via ITN.
STATUS_COMPLETE = "COMPLETE"
STATUS_PENDING = "PENDING"
STATUS_FAILED = "FAILED"
STATUS_CANCELLED = "CANCELLED"


def _settings():
    return get_settings()


def is_configured() -> bool:
    s = _settings()
    return bool(s.PAYFAST_MERCHANT_ID and s.PAYFAST_MERCHANT_KEY)


def process_url() -> str:
    return _SANDBOX_PROCESS if _settings().PAYFAST_MODE == "sandbox" else _LIVE_PROCESS


def validate_url() -> str:
    return _SANDBOX_VALIDATE if _settings().PAYFAST_MODE == "sandbox" else _LIVE_VALIDATE


def _resolve_return_url(base_url: str | None = None) -> str:
    s = _settings()
    if base_url:
        return s.PAYFAST_RETURN_URL or f"{base_url.rstrip('/')}/api/v1/payfast/return"
    return s.PAYFAST_RETURN_URL or f"{s.PAYFAST_BASE_URL.rstrip('/')}/api/v1/payfast/return"


def _resolve_cancel_url(base_url: str | None = None) -> str:
    s = _settings()
    if base_url:
        return s.PAYFAST_CANCEL_URL or f"{base_url.rstrip('/')}/api/v1/payfast/cancel"
    return s.PAYFAST_CANCEL_URL or f"{s.PAYFAST_BASE_URL.rstrip('/')}/api/v1/payfast/cancel"


def _resolve_notify_url(base_url: str | None = None) -> str:
    s = _settings()
    return s.PAYFAST_NOTIFY_URL or f"{base_url.rstrip('/')}/api/v1/payfast/itn" if base_url else (
        s.PAYFAST_NOTIFY_URL or f"{s.PAYFAST_BASE_URL.rstrip('/')}/api/v1/payfast/itn"
    )


def generate_signature(params: dict[str, str], passphrase: str = "") -> str:
    """Compute the PayFast MD5 signature for a dict of string values.

    Empty values are excluded; parameters are sorted alphabetically.
    The passphrase is appended to the query string when non-empty.
    """
    clean = {k: v for k, v in params.items() if v not in ("", None)}
    query = urlencode(sorted(clean.items()))
    if passphrase:
        query += f"&passphrase={passphrase}"
    return hashlib.md5(query.encode()).hexdigest()  # noqa: S324 — PayFast protocol


def verify_signature(params: dict[str, str], signature: str | None, passphrase: str = "") -> bool:
    if not signature:
        return False
    computed = generate_signature(params, passphrase)
    return computed.lower() == signature.lower()


def build_form_data(
    *,
    payment_id: str,
    amount: Decimal,
    item_name: str,
    item_description: str,
    name_first: str,
    name_last: str,
    email_address: str,
    base_url: str | None = None,
) -> dict[str, str]:
    """Build the hidden form fields posted to the PayFast process URL.

    The returned dict includes `signature`; post it to :func:`process_url`
    as an HTML form (application/x-www-form-urlencoded).

    `base_url` overrides `PAYFAST_BASE_URL` for the return/cancel/notify
    callbacks (used when the operator pins the gateway base via the DB).
    """
    s = _settings()
    params = {
        "merchant_id": s.PAYFAST_MERCHANT_ID,
        "merchant_key": s.PAYFAST_MERCHANT_KEY,
        "return_url": _resolve_return_url(base_url),
        "cancel_url": _resolve_cancel_url(base_url),
        "notify_url": _resolve_notify_url(base_url),
        "m_payment_id": payment_id,  # our internal payment id
        "amount": f"{amount:.2f}",   # two decimal places, no thousands separators
        "item_name": item_name,
        "item_description": item_description,
        "name_first": name_first,
        "name_last": name_last,
        "email_address": email_address,
    }
    params["signature"] = generate_signature(params, s.PAYFAST_PASSPHRASE)
    return params


def is_payfast_source_ip(client_ip: str | None) -> bool:
    """Best-effort check against documented PayFast ITN source ranges."""
    if not client_ip:
        return False
    import ipaddress

    ip = ipaddress.ip_address(client_ip)
    return any(ip in ipaddress.ip_network(cidr) for cidr in ITN_SOURCE_CIDRS)


async def validate_itn_with_payfast(payload: dict[str, str]) -> bool:
    """Re-submit the received ITN payload to PayFast and check for 'VALID'.

    This is the authoritative server-side validation step.
    """
    url = validate_url()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, data=payload)
        body = resp.text
    except httpx.HTTPError as exc:  # network / timeout — do NOT trust the ITN
        logger.warning("PayFast ITN validation request failed: %s", exc)
        return False
    if resp.status_code != 200:
        logger.warning("PayFast ITN validation returned HTTP %s", resp.status_code)
        return False
    # PayFast responds with a body starting with "VALID" on success.
    valid = body.strip().upper().startswith("VALID")
    if not valid:
        logger.warning("PayFast ITN validation rejected payload: %.200s", body)
    return valid
