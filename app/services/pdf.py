"""PDF generation for receipts, statements and invoices.

Renders printable A4 documents using the Lambton Christian School letterhead:
gold crest, Trebuchet-style display name, contact block, the Proverbs 22:6
motto and the school's gold/ink brand colours.
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from fastapi import Response
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.models.financial import Receipt, Statement
from app.models.invoice import Invoice

# ── Brand ───────────────────────────────────────────────────
_SCHOOL_NAME = "Lambton Christian School"
_SCHOOL_NAME_CAPS = "LAMBTON CHRISTIAN SCHOOL"
_CREST = Path(__file__).resolve().parent.parent / "static" / "crest_pdf.png"
if not _CREST.exists():  # fall back to the full-resolution crest if available
    _CREST = Path(__file__).resolve().parent.parent / "static" / "crest.png"

_CONTACT_LINES = [
    "PO Box 4056, Germiston South, 1411",
    "18 Neels Road, Lambton Gardens, Germiston, 1428",
    "Tel: 011 824 0735    EMIS Number: 700 400 316",
    "info@lambtonschool.co.za    www.lambtonschool.co.za",
]

_ICON_PHONE = Path(__file__).resolve().parent.parent / "static" / "icon_phone.png"
_ICON_WEB   = Path(__file__).resolve().parent.parent / "static" / "icon_web.png"
_ICON_EMAIL = Path(__file__).resolve().parent.parent / "static" / "icon_email.png"
_MOTTO = (
    "Train up a child in the way they shall go, and when they are older, "
    "they shall not depart from it - Proverbs 22:6"
)

# Brand palette (from the letterhead crest + ink text)
_INK = colors.HexColor("#1c1c1c")          # letterhead black text
_INK_SOFT = colors.HexColor("#5c5c5c")
_GOLD = colors.HexColor("#C9A227")         # crest gold (primary accent)
_GOLD_DARK = colors.HexColor("#A9851B")
_GOLD_SOFT = colors.HexColor("#F6F0DC")    # pale gold table header
_GOLD_ROW = colors.HexColor("#FDFBF3")     # pale gold zebra row
_LINE = colors.HexColor("#E3DCC9")         # warm hairline
_LINE_SOFT = colors.HexColor("#F0EBDB")

# ── Fonts ───────────────────────────────────────────────────
# Prefer DejaVu (metric-friendly, ships with most Linux/macOS) as the
# closest freely-available stand-in for the letterhead's Trebuchet MS.
# Falls back to Helvetica when the TTFs are not installed.
def _register_fonts() -> tuple[str, str]:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont("Brand", path))
            bold = str(Path(path).with_name("DejaVuSans-Bold.ttf"))
            italic = str(Path(path).with_name("DejaVuSans-Oblique.ttf"))
            if Path(bold).exists():
                pdfmetrics.registerFont(TTFont("Brand-Bold", bold))
            else:
                pdfmetrics.registerFontFamily("Brand", normal="Brand")
                pdfmetrics.registerFont(TTFont("Brand-Bold", path))
            if Path(italic).exists():
                pdfmetrics.registerFont(TTFont("Brand-Italic", italic))
            else:
                pdfmetrics.registerFont(TTFont("Brand-Italic", path))
            pdfmetrics.registerFontFamily(
                "Brand", normal="Brand", bold="Brand-Bold", italic="Brand-Italic",
                boldItalic="Brand-Bold",
            )
            return "Brand", "Brand-Bold"
    pdfmetrics.registerFontFamily(
        "Brand", normal="Helvetica", bold="Helvetica-Bold",
        italic="Helvetica-Oblique", boldItalic="Helvetica-BoldOblique",
    )
    return "Helvetica", "Helvetica-Bold"


_BRAND_FONT, _BRAND_BOLD = _register_fonts()

_MONEY_STYLE = ParagraphStyle(
    "Money", parent=getSampleStyleSheet()["Normal"], alignment=TA_RIGHT,
    fontName=_BRAND_FONT, textColor=_INK, fontSize=10,
)
_MONEY_BOLD = ParagraphStyle(
    "MoneyBold", parent=_MONEY_STYLE, fontName=_BRAND_BOLD
)
_NORMAL = ParagraphStyle(
    "Normal", parent=getSampleStyleSheet()["Normal"],
    fontName=_BRAND_FONT, textColor=_INK, fontSize=10,
)
_NUMBER_STYLE = ParagraphStyle(
    "Number", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=11,
    textColor=_GOLD_DARK, spaceAfter=4,
)


def money(value: Decimal | float | str | int | None) -> str:
    """Format a value as South African Rand, e.g. R 1,234.50."""
    try:
        num = Decimal(str(value or 0))
    except (ValueError, TypeError):
        num = Decimal("0")
    return f"R {num:,.2f}"


def _fmt_date(value: datetime | None) -> str:
    return value.strftime("%d %b %Y") if value else "—"


def _fmt_datetime(value: datetime | None) -> str:
    return value.strftime("%d %b %Y %H:%M") if value else "—"


def _heading(title: str) -> Paragraph:
    style = ParagraphStyle(
        "Title", parent=getSampleStyleSheet()["Heading1"],
        fontName=_BRAND_BOLD, fontSize=16, textColor=_INK,
        spaceAfter=2, leading=20,
    )
    return Paragraph(title, style)


def _gold_rule_flowable() -> Table:
    """A short gold underline used under document headings."""
    t = Table([[""]], colWidths=[40 * mm], rowHeights=[1.5 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _GOLD)]))
    return t


class _Document:
    """A4 reportlab document with the Lambton letterhead on every page."""

    def __init__(self, doc_type: str) -> None:
        self.doc_type = doc_type
        self.buffer = BytesIO()
        self.story: list = []

    # layout metrics (mm)
    _MARGIN = 16 * mm
    _HEADER_H = 56 * mm   # increased to accommodate crest + text side-by-side
    _FOOTER_H = 16 * mm

    def _on_page(self, canvas, doc) -> None:  # pragma: no cover - reportlab callback
        canvas.saveState()
        top = A4[1]

        # ── Header layout ──────────────────────────────────────────────────
        # Crest on the LEFT (square, 36mm), school name + contacts on the RIGHT
        # of the crest, all vertically centred in a 42mm header band.
        # This mirrors the Word letterhead: logo beside text, never overlapping.

        header_top    = top - 8 * mm          # top of header band
        header_bottom = top - 42 * mm         # bottom of header band
        crest_size    = 34 * mm               # crest square size
        crest_x       = self._MARGIN
        crest_y       = header_bottom + (header_bottom - (header_top - crest_size)) / 2
        # vertically centre the crest in the band
        crest_y = header_bottom + ((header_top - header_bottom) - crest_size) / 2

        # Draw crest
        if _CREST.exists():
            try:
                canvas.drawImage(
                    str(_CREST),
                    crest_x,
                    crest_y,
                    width=crest_size,
                    height=crest_size,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:  # noqa: BLE001
                pass

        # Text block starts to the right of the crest with a gap
        text_x = crest_x + crest_size + 6 * mm

        # School name (large, bold, gold)
        canvas.setFont(_BRAND_BOLD, 15)
        canvas.setFillColor(_GOLD_DARK)
        canvas.drawString(text_x, header_top - 7 * mm, _SCHOOL_NAME_CAPS)

        # Gold underline beneath the name
        name_w = stringWidth(_SCHOOL_NAME_CAPS, _BRAND_BOLD, 15)
        canvas.setStrokeColor(_GOLD)
        canvas.setLineWidth(1.2)
        canvas.line(text_x, header_top - 9.5 * mm, text_x + name_w, header_top - 9.5 * mm)

        # Address lines
        canvas.setFont(_BRAND_FONT, 7.8)
        canvas.setFillColor(_INK_SOFT)
        canvas.drawString(text_x, header_top - 14 * mm, _CONTACT_LINES[0])
        canvas.drawString(text_x, header_top - 18 * mm, _CONTACT_LINES[1])

        # Phone / EMIS line with icon
        icon_size = 3.8 * mm
        icon_y_offset = -1 * mm          # nudge icon down to align with text baseline
        line_y = header_top - 22.5 * mm
        if _ICON_PHONE.exists():
            try:
                canvas.drawImage(
                    str(_ICON_PHONE), text_x, line_y + icon_y_offset,
                    width=icon_size, height=icon_size, mask="auto", preserveAspectRatio=True,
                )
            except Exception:  # noqa: BLE001
                pass
        canvas.setFont(_BRAND_FONT, 7.8)
        canvas.setFillColor(_INK_SOFT)
        canvas.drawString(text_x + icon_size + 1.5 * mm, line_y, _CONTACT_LINES[2])

        # Email / website line with email icon
        line_y2 = header_top - 27.5 * mm
        if _ICON_EMAIL.exists():
            try:
                canvas.drawImage(
                    str(_ICON_EMAIL), text_x, line_y2 + icon_y_offset,
                    width=icon_size, height=icon_size, mask="auto", preserveAspectRatio=True,
                )
            except Exception:  # noqa: BLE001
                pass
        canvas.drawString(text_x + icon_size + 1.5 * mm, line_y2, _CONTACT_LINES[3])

        # ── hairline separating letterhead from content ──
        canvas.setStrokeColor(_LINE)
        canvas.setLineWidth(0.6)
        canvas.line(self._MARGIN, top - 44 * mm, A4[0] - self._MARGIN, top - 44 * mm)
        # thin gold accent under the hairline
        canvas.setStrokeColor(_GOLD)
        canvas.setLineWidth(2.2)
        canvas.line(self._MARGIN, top - 45.2 * mm, A4[0] - self._MARGIN, top - 45.2 * mm)

        # ── document type (top-right corner) ──
        canvas.setFont(_BRAND_BOLD, 8.5)
        canvas.setFillColor(_GOLD_DARK)
        canvas.drawRightString(A4[0] - self._MARGIN, top - 49 * mm, self.doc_type)

        # ── footer: motto + generated/page ──
        canvas.setFont(_BRAND_FONT, 7.5)
        canvas.setFillColor(_INK_SOFT)
        motto = _MOTTO
        motto_w = stringWidth(motto, _BRAND_FONT, 7.5)
        canvas.drawString(
            (A4[0] - motto_w) / 2, 14 * mm, motto,
        )
        canvas.setStrokeColor(_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(self._MARGIN, 20 * mm, A4[0] - self._MARGIN, 20 * mm)
        canvas.setFont(_BRAND_FONT, 7.5)
        canvas.drawString(
            self._MARGIN, 12 * mm, f"Generated {_fmt_datetime(datetime.utcnow())}"
        )
        canvas.drawRightString(A4[0] - self._MARGIN, 12 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    def build(self) -> bytes:
        doc = BaseDocTemplate(
            self.buffer,
            pagesize=A4,
            leftMargin=self._MARGIN,
            rightMargin=self._MARGIN,
            topMargin=self._HEADER_H,
            bottomMargin=self._FOOTER_H,
        )
        frame = Frame(
            doc.leftMargin,
            doc.bottomMargin,
            doc.width,
            doc.height,
            id="normal",
        )
        doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=self._on_page)])
        doc.build(self.story)
        return self.buffer.getvalue()


def _meta_table(rows: list[tuple[str, str]]) -> Table:
    data = [[Paragraph(label, _NORMAL), Paragraph(value, _MONEY_STYLE)] for label, value in rows]
    table = Table(data, colWidths=[70 * mm, 110 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, _LINE_SOFT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _items_table(headers: list[str], rows: list[list[str]]) -> Table:
    data = [headers] + rows
    table = Table(data, colWidths=[110 * mm, 70 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _GOLD_SOFT),
                ("FONTNAME", (0, 0), (-1, 0), _BRAND_BOLD),
                ("TEXTCOLOR", (0, 0), (-1, 0), _INK),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _GOLD_ROW]),
                ("GRID", (0, 0), (-1, -1), 0.5, _LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("FONTNAME", (0, 1), (-1, -1), _BRAND_FONT),
                ("TEXTCOLOR", (0, 1), (-1, -1), _INK),
            ]
        )
    )
    return table


def _totals_table(rows: list[tuple[str, str]]) -> Table:
    data = [[Paragraph(label, _NORMAL), Paragraph(value, _MONEY_STYLE)] for label, value in rows]
    table = Table(data, colWidths=[110 * mm, 70 * mm])
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, _GOLD),
        ("TEXTCOLOR", (0, 0), (-1, -1), _INK),
    ]
    # Emphasise the final "balance due" row
    style.append(("FONTNAME", (0, -1), (-1, -1), _BRAND_BOLD))
    style.append(("TEXTCOLOR", (0, -1), (-1, -1), _GOLD_DARK))
    style.append(("LINEABOVE", (0, -1), (-1, -1), 0.8, _GOLD))
    table.setStyle(TableStyle(style))
    return table


# ── Receipt ────────────────────────────────────────────────
def build_receipt_pdf(receipt: Receipt, student_name: str, allocator_name: str) -> bytes:
    doc = _Document("OFFICIAL PAYMENT RECEIPT")
    doc.story.extend(
        [
            _heading("Receipt"),
            Paragraph(f"{receipt.receipt_number}", _NUMBER_STYLE),
            Spacer(1, 2 * mm),
            _gold_rule_flowable(),
            Spacer(1, 6 * mm),
            _meta_table(
                [
                    ("Receipt number", receipt.receipt_number),
                    ("Student", student_name),
                    ("Amount paid", money(receipt.amount)),
                    ("Payment method", receipt.payment_method),
                    ("Date", _fmt_date(receipt.created_at)),
                    ("Time", _fmt_datetime(receipt.created_at).split(" ", 2)[-1]
                     if receipt.created_at else "—"),
                    ("Received by", allocator_name),
                ]
            ),
            Spacer(1, 10 * mm),
            Paragraph(
                "This receipt confirms payment received by Lambton Christian School.",
                _NORMAL,
            ),
        ]
    )
    return doc.build()


# ── Statement ──────────────────────────────────────────────
# Bank-style ledger statement that mirrors the frontend statement page
# exactly: navy account-header card (school name + 4 account fields),
# a 3-cell balance strip (Opening / Closing / Amount Due), a 5-column
# ledger (Date | Details | Debit | Credit | Balance) and a totals footer.

_STMT_NAVY = colors.HexColor("#131D3C")
_STMT_ROW_ALT = colors.HexColor("#F7F8FB")
_STMT_DEBIT = colors.HexColor("#BE123C")      # rose-700 (frontend debit)
_STMT_CREDIT = colors.HexColor("#047857")     # emerald-700 (frontend credit)
_STMT_MUTED = colors.HexColor("#94A3B8")      # slate-400


def _statement_header(account: dict) -> Table:
    """Navy account-header card: school name + 'Statement of Account', then a
    4-field grid — Account Holder / Account Number / Statement Period / Date Issued."""
    _right = ParagraphStyle(
        "StmtHeaderRight",
        parent=_NORMAL,
        alignment=TA_RIGHT,
    )
    header = Table(
        [[
            Paragraph(
                '<font color="#FFFFFF"><b>Lambton Christian School</b></font>',
                _NORMAL,
            ),
            Paragraph(
                '<font color="#C7CFE6">STATEMENT OF ACCOUNT</font>',
                _right,
            ),
        ]],
        colWidths=[110 * mm, 70 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )

    fields = [
        ("Account Holder", account.get("name", "—")),
        ("Account Number", account.get("number", "—")),
        ("Statement Period", account.get("period", "—")),
        ("Date Issued", account.get("issued", "—")),
    ]
    cells = []
    for label, value in fields:
        cells.append(
            Paragraph(
                f'<font color="#94A3B8" size="7">{label.upper()}</font><br/>'
                f'<font color="#FFFFFF"><b>{value}</b></font>',
                _NORMAL,
            )
        )

    fields_t = Table([cells], colWidths=[45 * mm] * 4)
    fields_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    body = [
        [header],
        [fields_t],
    ]
    t = Table(body, colWidths=[180 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#FFFFFF22")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def _balance_strip(statement: Statement) -> Table:
    """3-cell strip: Opening Balance | Closing Balance | Amount Due (navy)."""
    opening = Paragraph(
        '<font color="#64748B" size="7">OPENING BALANCE</font><br/>'
        f'<font color="#0F172A"><b>{money(statement.opening_balance)}</b></font>',
        _NORMAL,
    )
    closing = Paragraph(
        '<font color="#64748B" size="7">CLOSING BALANCE</font><br/>'
        f'<font color="#0F172A"><b>{money(statement.closing_balance)}</b></font>',
        _NORMAL,
    )
    due = Paragraph(
        '<font color="#94A3B8" size="7">AMOUNT DUE</font><br/>'
        f'<font color="#FFFFFF"><b>{money(statement.current_amount_due)}</b></font>',
        _NORMAL,
    )

    t = Table([[opening, closing, due]], colWidths=[60 * mm] * 3)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (1, 0), _STMT_ROW_ALT),
                ("BACKGROUND", (2, 0), (2, 0), _STMT_NAVY),
                ("LINEAFTER", (0, 0), (1, 0), 0.5, _LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def _ledger_table(rows: list[dict]) -> Table:
    """5-column ledger matching the frontend: Date | Details | Debit | Credit | Balance."""
    data = [
        [
            Paragraph('<b>Date</b>', _NORMAL),
            Paragraph('<b>Transaction Details</b>', _NORMAL),
            Paragraph('<b>Debit</b>', _MONEY_STYLE),
            Paragraph('<b>Credit</b>', _MONEY_STYLE),
            Paragraph('<b>Balance</b>', _MONEY_STYLE),
        ]
    ]
    for r in rows:
        # Frontend colours: debit rose-700, credit emerald-700, balance slate-900.
        debit_p = Paragraph(
            f'<font color="#BE123C">{money(r.get("debit"))}</font>'
            if r.get("debit") is not None else "",
            _MONEY_STYLE,
        )
        credit_p = Paragraph(
            f'<font color="#047857">{money(r.get("credit"))}</font>'
            if r.get("credit") is not None else "",
            _MONEY_STYLE,
        )
        bold = r.get("bold")
        desc_style = ParagraphStyle(
            "LedgerDesc",
            parent=_NORMAL,
            fontName=_BRAND_BOLD if bold else _BRAND_FONT,
        )
        date_style = ParagraphStyle(
            "LedgerDate",
            parent=_NORMAL,
            fontName=_BRAND_BOLD if bold else _BRAND_FONT,
            textColor=_INK if bold else _INK_SOFT,
        )
        bal_style = ParagraphStyle(
            "LedgerBal",
            parent=_MONEY_BOLD if bold else _MONEY_STYLE,
        )
        data.append(
            [
                Paragraph(r.get("date", ""), date_style),
                Paragraph(r.get("description", ""), desc_style),
                debit_p,
                credit_p,
                Paragraph(money(r.get("balance")), bal_style),
            ]
        )

    t = Table(data, colWidths=[30 * mm, 70 * mm, 25 * mm, 28 * mm, 27 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.white),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, _STMT_MUTED),
        ("FONTNAME", (0, 0), (-1, 0), _BRAND_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _STMT_ROW_ALT]),
    ]
    # Bold final row with a strong top border (balance carried forward)
    if rows:
        style.append(("LINEABOVE", (0, -1), (-1, -1), 1.2, _STMT_MUTED))
        style.append(("FONTNAME", (0, -1), (-1, -1), _BRAND_BOLD))
    t.setStyle(TableStyle(style))
    return t


def _statement_footer(statement: Statement) -> Table:
    """Light strip: total annual fees, payments received, due date + thanks."""
    fees = Paragraph(
        'Total annual fees: '
        f'<font color="#0F172A"><b>{money(statement.total_fees).replace(" ", "&nbsp;")}</b></font>',
        _NORMAL,
    )
    payments = Paragraph(
        "Payments received: "
        '<font color="#047857"><b>'
        f"{money(statement.total_payments).replace(' ', '&nbsp;')}"
        "</b></font>",
        _NORMAL,
    )
    due = Paragraph(
        'Due date: '
        f'<font color="#0F172A"><b>{_fmt_date(statement.due_date)}</b></font>',
        _NORMAL,
    )
    thanks = Paragraph(
        '<font color="#94A3B8">Thank you for banking with Lambton Christian School</font>',
        _NORMAL,
    )

    t = Table([[fees, payments, due], [thanks]], colWidths=[60 * mm] * 3)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _STMT_ROW_ALT),
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, _LINE),
                ("SPAN", (0, 1), (-1, 1)),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ]
        )
    )
    return t


def build_statement_pdf(
    statement: Statement,
    student_name: str,
    ledger: list[dict] | None = None,
    *,
    student_number: str = "",
) -> bytes:
    doc = _Document("STATEMENT OF ACCOUNT")

    period_start = datetime(statement.academic_year, statement.month, 1)
    period_label = f"{period_start.strftime('%B %Y')}"
    issued = statement.generated_at
    account = {
        "name": student_name,
        "number": student_number,
        "period": period_label,
        "issued": issued.strftime("%-d %b %Y") if issued else "—",
    }

    doc.story.extend(
        [
            _statement_header(account),
            Spacer(1, 4 * mm),
            _balance_strip(statement),
            Spacer(1, 6 * mm),
            _ledger_table(ledger or []),
            Spacer(1, 6 * mm),
            _statement_footer(statement),
        ]
    )
    return doc.build()


# ── Invoice ────────────────────────────────────────────────
def build_invoice_pdf(invoice: Invoice, student_name: str) -> bytes:
    doc = _Document("INVOICE")
    doc.story.extend(
        [
            _heading("Invoice"),
            Paragraph(f"{invoice.invoice_number}", _NUMBER_STYLE),
            Spacer(1, 2 * mm),
            _gold_rule_flowable(),
            Spacer(1, 6 * mm),
            _meta_table(
                [
                    ("Student", student_name),
                    ("Billing period", f"{invoice.month:02d} / {invoice.academic_year}"),
                    ("Issue date", _fmt_date(invoice.issue_date)),
                    ("Due date", _fmt_date(invoice.due_date)),
                    ("Status", invoice.status.upper()),
                ]
            ),
            Spacer(1, 8 * mm),
            _items_table(
                ["Description", "Amount"],
                [
                    [item.get("description", ""), money(item.get("amount", 0))]
                    for item in invoice.items or []
                ],
            ),
            Spacer(1, 6 * mm),
            _totals_table(
                [
                    ("Subtotal", money(invoice.subtotal)),
                    ("Amount paid", money(invoice.amount_paid)),
                    ("Balance due", money(invoice.balance_due)),
                ]
            ),
        ]
    )
    return doc.build()


def iter_money(values: Iterable[Decimal | float | str]) -> Decimal:
    total = Decimal("0")
    for v in values:
        try:
            total += Decimal(str(v or 0))
        except (ValueError, TypeError):
            continue
    return total


def pdf_response(content: bytes, filename: str) -> Response:
    """Wrap rendered PDF bytes in a download response."""
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
