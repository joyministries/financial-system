"""Public pay-by-link page.

`GET /pay/{payment_id}` renders a small, brand-styled page that the parent
can open from an SMS/email/WhatsApp link. It posts a signed PayFast form on
the "Pay now" tap, so no login is required — the payment id is an unguessable
UUID capability token scoped to a single pending payment.

The submit is a plain native form POST (no auto-submit script): the parent
taps "Pay now" and the browser navigates to PayFast's secure page. Keeping the
button inside the form with `type="submit"` guarantees the click always
submits — earlier versions auto-submitted on load, which made the visible
button feel dead because the form had already navigated.
"""

from __future__ import annotations

import base64
import html
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.financial import Student
from app.models.grade import Grade
from app.models.user import User
from app.services import payfast as pf
from app.services.payment import PaymentService

router = APIRouter(tags=["Pay"])

_CREST_DATA_URI = ""
# Prefer the web-optimized crest (200px palette PNG, ~8KB) so the page loads
# fast on mobile links. The 400px/1181px originals are 131KB+ and made the
# whole page ~180KB, which rendered slowly/unstyled over the ngrok tunnel.
for _name in ("crest_web.png", "crest_web_144.png", "crest_pdf.png", "crest.png"):
    _crest = Path(__file__).resolve().parent.parent / "static" / _name
    if _crest.exists():
        _CREST_DATA_URI = (
            "data:image/png;base64," + base64.b64encode(_crest.read_bytes()).decode("ascii")
        )
        break

# Lambton brand: ink #1c1c1f, gold #e9c766 -> #c9a227, display face Trebuchet MS.
_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pay — Lambton Christian School</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Inter, 'Segoe UI', -apple-system, Arial, sans-serif;
    background: linear-gradient(160deg, #f6f6f7 0%, #faf9f5 55%, #f2df9a 180%);
    color: #1c1c1f;
    display: flex; min-height: 100vh; align-items: center; justify-content: center;
    padding: 24px 16px;
  }
  .card {
    background: #ffffff; border: 1px solid #e8e8ea; border-radius: 20px;
    box-shadow: 0 1px 3px rgba(16,24,40,.06), 0 20px 48px -16px rgba(28,28,31,.22);
    max-width: 420px; width: 100%; overflow: hidden;
  }
  .head {
    background: linear-gradient(150deg, #1c1c1f, #333438);
    color: #ffffff; text-align: center; padding: 30px 20px 26px;
  }
  .head img {
    width: 72px; height: 72px; border-radius: 14px; background: #fff;
    margin-bottom: 14px; box-shadow: 0 8px 20px -8px rgba(0,0,0,.55);
  }
  .head h1 {
    font-family: 'Trebuchet MS', Inter, Arial, sans-serif;
    font-size: 19px; letter-spacing: .03em;
  }
  .head p { font-size: 12px; color: #c9c9ce; margin-top: 5px; letter-spacing: .04em; }
  .body { padding: 28px 26px 30px; }
  .amount { text-align: center; margin-bottom: 8px; }
  .amount .label {
    font-size: 12px; text-transform: uppercase; letter-spacing: .1em;
    color: #5c5d66; font-weight: 600;
  }
  .amount .value {
    font-size: 40px; font-weight: 800; color: #1c1c1f; margin-top: 4px;
    letter-spacing: -.01em;
  }
  .amount .value span { color: #a9851b; }
  .student { text-align: center; margin-bottom: 26px; }
  .student .name { font-size: 16px; font-weight: 700; color: #1c1c1f; }
  .student .meta {
    font-size: 12px; color: #82838d; margin-top: 3px; letter-spacing: .02em;
  }
  .divider { height: 1px; background: #e8e8ea; margin: 0 0 22px; }
  button {
    width: 100%; padding: 15px 16px; font-size: 16px; font-weight: 700;
    color: #1c1c1f; font-family: inherit; cursor: pointer;
    background: linear-gradient(135deg, #e9c766, #dfb445 55%, #c9a227);
    border: none; border-radius: 12px;
    box-shadow: 0 4px 14px -4px rgba(201,162,39,.55), inset 0 1px 0 rgba(255,255,255,.35);
    transition: filter .15s ease, transform .05s ease;
  }
  button:hover { filter: brightness(1.05); }
  button:active { transform: translateY(1px); }
  .note {
    font-size: 12px; color: #5c5d66; text-align: center;
    margin-top: 16px; line-height: 1.55;
  }
  .secure {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    font-size: 12px; color: #82838d; margin-top: 18px;
  }
  .bad { text-align: center; padding: 44px 26px; }
  .bad h1 { font-size: 18px; margin-bottom: 8px; }
  .bad p { font-size: 13px; color: #5c5d66; line-height: 1.5; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="card">
  __BODY__
</div>
</body>
</html>
"""

_PAY_BODY = """
  <div class="head">
    __CREST__
    <h1>Lambton Christian School</h1>
    <p>Secure fee payment</p>
  </div>
  <div class="body">
    <div class="amount">
      <div class="label">Amount due</div>
      <div class="value"><span>R</span>__AMOUNT__</div>
    </div>
    <div class="student">
      <div class="name">__STUDENT__</div>
      <div class="meta">__STUDENT_META__</div>
    </div>
    <div class="divider"></div>
    <form method="post" action="__ACTION__">
      __HIDDEN__
      <button type="submit">Pay now</button>
    </form>
    <div class="note">You'll be taken to PayFast's secure payment page to pay
      by card or instant EFT. Your receipt will be sent to you automatically.</div>
    <div class="secure">Secured by PayFast</div>
  </div>
"""

_NOT_FOUND_BODY = """
  <div class="bad">
    <h1>Payment link not available</h1>
    <p>This link is invalid, expired or the payment has already been processed.
       Please contact the school office if you believe this is a mistake.</p>
  </div>
"""


@router.get("/pay/{payment_token}", response_class=HTMLResponse, include_in_schema=False)
async def payment_page(
    payment_token: str,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Render the no-login pay page for a pending PayFast payment.

    `payment_token` is either the short `pay_code` used in SMS links (the full
    UUID was too long and got truncated in SMS) or the legacy payment UUID.
    """
    if not pf.is_configured():
        body = _NOT_FOUND_BODY
    else:
        service = PaymentService(db)
        payment = await service.get(payment_token)
        if payment is None and len(payment_token) <= 12:
            payment = await service.get_by_pay_code(payment_token)
        body = _NOT_FOUND_BODY
        if payment and payment.payment_method == "payfast" and payment.status == "pending":
            student = await db.get(Student, payment.student_id)
            if not student:
                raise HTTPException(status_code=404, detail="Student not found")
            parent = None
            if student.parent_id:
                parent = await db.get(User, student.parent_id)
            name_first = student.first_name
            name_last = ""
            email_address = ""
            if parent:
                name_first = parent.full_name.split(" ", 1)[0] or student.first_name
                name_last = parent.full_name.split(" ", 1)[1] if " " in parent.full_name else ""
                email_address = parent.email or ""
            try:
                form_fields = pf.build_form_data(
                    payment_id=payment.id,
                    amount=payment.amount,
                    item_name="School Fees",
                    item_description="School fees payment",
                    name_first=name_first,
                    name_last=name_last,
                    email_address=email_address,
                )
            except Exception:  # noqa: BLE001 - config errors render the not-found page
                body = _NOT_FOUND_BODY
            else:
                hidden = "\n      ".join(
                    f'<input type="hidden" name="{html.escape(str(k))}" '
                    f'value="{html.escape(str(v))}">'
                    for k, v in form_fields.items()
                )
                crest_img = (
                    f'<img src="{_CREST_DATA_URI}" alt="Lambton Christian School crest">'
                    if _CREST_DATA_URI
                    else ""
                )
                grade_name = ""
                if student.grade_id:
                    grade = await db.get(Grade, student.grade_id)
                    grade_name = grade.name if grade else ""
                meta_parts = [
                    part
                    for part in (
                        grade_name,
                        student.student_number if student.student_number else "",
                    )
                    if part
                ]
                body = (
                    _PAY_BODY.replace("__CREST__", crest_img)
                    .replace("__AMOUNT__", html.escape(f"{payment.amount:,.2f}"))
                    .replace(
                        "__STUDENT__",
                        html.escape(f"{student.first_name} {student.last_name or ''}".strip()),
                    )
                    .replace(
                        "__STUDENT_META__",
                        html.escape(" • ".join(meta_parts)) if meta_parts else "&nbsp;",
                    )
                    .replace("__ACTION__", html.escape(pf.process_url()))
                    .replace("__HIDDEN__", hidden)
                )

    return HTMLResponse(
        _PAGE_TEMPLATE.replace("__BODY__", body),
        headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"},
    )
