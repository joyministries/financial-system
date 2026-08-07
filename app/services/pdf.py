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
    "PO Box 4056, Germiston South, 1411  |  18 Neels Road, Lambton Gardens, Germiston, 1428",
    "Tel: 011 824 0735  |  EMIS Number: 700 400 316",
    "info@lambtonschool.co.za  |  www.lambtonschool.co.za",
]
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
    _HEADER_H = 46 * mm
    _FOOTER_H = 16 * mm

    def _on_page(self, canvas, doc) -> None:  # pragma: no cover - reportlab callback
        canvas.saveState()
        top = A4[1]

        # ── crest (gold school emblem) ──
        crest_h = 22 * mm
        if _CREST.exists():
            try:
                canvas.drawImage(
                    str(_CREST),
                    self._MARGIN,
                    top - 9 * mm - crest_h,
                    height=crest_h,
                    width=crest_h,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:  # noqa: BLE001 - never break the PDF over artwork
                pass

        # ── school name ──
        canvas.setFont(_BRAND_BOLD, 17)
        canvas.setFillColor(_INK)
        name_w = stringWidth(_SCHOOL_NAME_CAPS, _BRAND_BOLD, 17)
        canvas.drawString(self._MARGIN, top - 15 * mm, _SCHOOL_NAME_CAPS)
        # gold underline under the name
        canvas.setStrokeColor(_GOLD)
        canvas.setLineWidth(1.2)
        canvas.line(self._MARGIN, top - 18.5 * mm, self._MARGIN + name_w, top - 18.5 * mm)

        # ── contact block ──
        canvas.setFont(_BRAND_FONT, 7.5)
        canvas.setFillColor(_INK_SOFT)
        canvas.drawString(self._MARGIN, top - 24 * mm, _CONTACT_LINES[0])
        canvas.drawString(self._MARGIN, top - 27.5 * mm, _CONTACT_LINES[1])
        canvas.drawString(self._MARGIN, top - 31 * mm, _CONTACT_LINES[2])

        # ── hairline separating letterhead from content ──
        canvas.setStrokeColor(_LINE)
        canvas.setLineWidth(0.6)
        canvas.line(self._MARGIN, top - 34 * mm, A4[0] - self._MARGIN, top - 34 * mm)
        # thin gold accent under the hairline
        canvas.setStrokeColor(_GOLD)
        canvas.setLineWidth(2.2)
        canvas.line(self._MARGIN, top - 35.2 * mm, A4[0] - self._MARGIN, top - 35.2 * mm)

        # ── document type (top-right of content area) ──
        canvas.setFont(_BRAND_BOLD, 8.5)
        canvas.setFillColor(_GOLD_DARK)
        canvas.drawRightString(A4[0] - self._MARGIN, top - 40.5 * mm, self.doc_type)

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
def build_statement_pdf(statement: Statement, student_name: str) -> bytes:
    doc = _Document("STUDENT STATEMENT")
    doc.story.extend(
        [
            _heading("Student Statement"),
            Paragraph(
                f"{statement.academic_year} · Month {statement.month:02d}", _NUMBER_STYLE
            ),
            Spacer(1, 2 * mm),
            _gold_rule_flowable(),
            Spacer(1, 6 * mm),
            _meta_table(
                [
                    ("Student", student_name),
                    ("Period", f"{statement.month:02d} / {statement.academic_year}"),
                    ("Opening balance", money(statement.opening_balance)),
                    ("Total annual fees", money(statement.total_fees)),
                    ("Monthly installment", money(statement.total_installments)),
                    ("Additional charges", money(statement.total_additional_charges)),
                    ("Payments received", money(statement.total_payments)),
                    ("Closing balance", money(statement.closing_balance)),
                    ("Amount due", money(statement.current_amount_due)),
                    ("Due date", _fmt_date(statement.due_date)),
                    ("Generated", _fmt_datetime(statement.generated_at)),
                ]
            ),
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
