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
from reportlab.pdfgen import canvas as _rl_canvas
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

# ── Bank details (shown on statements) ──────────────────────
# TODO: replace the placeholders below with the school's real bank details.
_BANK_NAME = "Bank Name"
_BANK_ACCOUNT = "0000 000 0000"
_BANK_BRANCH = "000000"

# ── Light statement palette (mirrors the HTML statement template) ──
_LIGHT_TEXT = colors.HexColor("#333333")
_LIGHT_LABEL = colors.HexColor("#888888")
_LIGHT_DESC = colors.HexColor("#444444")
_LIGHT_BORDER_SOFT = colors.HexColor("#EEEEEE")
_LIGHT_BORDER = colors.HexColor("#DDDDDD")
_LIGHT_GOLD = colors.HexColor("#E1C073")
_LIGHT_GOLD_DARK = colors.HexColor("#B08B2F")  # gold kept readable on white
_LIGHT_HEADING = colors.HexColor("#111111")

# ── Fonts ───────────────────────────────────────────────────
# Prefer DejaVu (metric-friendly, ships with most Linux/macOS) as the
# closest freely-available stand-in for the letterhead's Trebuchet MS.
# Falls back to Helvetica when the TTFs are not installed.
def _register_fonts() -> tuple[str, str]:
    # Bundled DejaVu ships with the app (app/static/fonts) so PDF rendering is
    # deterministic on serverless runtimes (Vercel/Lambda have no system fonts).
    bundled = Path(__file__).resolve().parent.parent / "static" / "fonts"
    candidates = [
        bundled / "DejaVuSans.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
        Path("/Library/Fonts/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.exists():
            pdfmetrics.registerFont(TTFont("Brand", str(path)))
            bold = path.with_name("DejaVuSans-Bold.ttf")
            italic = path.with_name("DejaVuSans-Oblique.ttf")
            if bold.exists():
                pdfmetrics.registerFont(TTFont("Brand-Bold", str(bold)))
            else:
                pdfmetrics.registerFontFamily("Brand", normal="Brand")
                pdfmetrics.registerFont(TTFont("Brand-Bold", str(path)))
            if italic.exists():
                pdfmetrics.registerFont(TTFont("Brand-Italic", str(italic)))
            else:
                pdfmetrics.registerFont(TTFont("Brand-Italic", str(path)))
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


# ── Light statement styles (HTML statement template) ─────────
_STMT_PARTY_LABEL = ParagraphStyle(
    "StmtPartyLabel", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=9,
    textColor=_LIGHT_LABEL, spaceAfter=3, leading=11,
)
_STMT_PARTY_NAME = ParagraphStyle(
    "StmtPartyName", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=15,
    textColor=_LIGHT_HEADING, spaceAfter=8, leading=19,
)
_STMT_ADDR_LABEL = ParagraphStyle(
    "StmtAddrLabel", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=8.5,
    textColor=_LIGHT_LABEL, spaceAfter=2, leading=10,
)
_STMT_ADDR = ParagraphStyle(
    "StmtAddr", parent=_NORMAL, fontSize=9, textColor=_LIGHT_DESC, leading=12,
)
_STMT_TABLE_HDR = ParagraphStyle(
    "StmtTblHdr", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=9,
    textColor=_LIGHT_LABEL, leading=11,
)
_STMT_TABLE_HDR_R = ParagraphStyle(
    "StmtTblHdrR", parent=_STMT_TABLE_HDR, alignment=TA_RIGHT,
)
_STMT_TABLE_BODY = ParagraphStyle(
    "StmtTblBody", parent=_NORMAL, fontSize=9.5, textColor=_LIGHT_TEXT, leading=12,
)
_STMT_TABLE_DESC = ParagraphStyle(
    "StmtTblDesc", parent=_STMT_TABLE_BODY, textColor=_LIGHT_DESC,
    fontName="Brand-Italic",
)
_STMT_TABLE_BOLD = ParagraphStyle(
    "StmtTblBold", parent=_STMT_TABLE_BODY, fontName=_BRAND_BOLD,
    textColor=_LIGHT_HEADING,
)
_STMT_TABLE_MONEY = ParagraphStyle(
    "StmtTblMoney", parent=_STMT_TABLE_BODY, alignment=TA_RIGHT,
)
_STMT_TABLE_MONEY_B = ParagraphStyle(
    "StmtTblMoneyB", parent=_STMT_TABLE_MONEY, fontName=_BRAND_BOLD,
)
_STMT_TOTAL_LABEL = ParagraphStyle(
    "StmtTotLabel", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=12,
    textColor=_LIGHT_HEADING, leading=15,
)
_STMT_TOTAL_VALUE = ParagraphStyle(
    "StmtTotValue", parent=_STMT_TOTAL_LABEL, alignment=TA_RIGHT,
    textColor=_LIGHT_GOLD_DARK,
)
_STMT_NOTE = ParagraphStyle(
    "StmtNote", parent=_NORMAL, fontSize=9.5, textColor=_LIGHT_DESC, leading=13,
    spaceAfter=6,
)
_STMT_NOTE_BOLD = ParagraphStyle(
    "StmtNoteBold", parent=_STMT_NOTE, fontName=_BRAND_BOLD, textColor=_LIGHT_TEXT,
)


class _PageCountingCanvas(_rl_canvas.Canvas):
    """Canvas that can draw 'PAGE: n/total' once the page count is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = max(1, len(self._saved_page_states))
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_label(total)
            super().showPage()
        super().save()

    def _draw_page_label(self, total: int) -> None:
        margin = getattr(self, "_stmt_margin", 18 * mm)
        top = A4[1]
        self.setFont(_BRAND_FONT, 10)
        self.setFillColor(_LIGHT_LABEL)
        self.drawString(margin, top - 35.5 * mm, "PAGE:")
        self.setFont(_BRAND_BOLD, 10)
        self.setFillColor(_LIGHT_HEADING)
        self.drawString(margin + 15 * mm, top - 35.5 * mm, f"{self.getPageNumber()}/{total}")


class _StatementDocument:
    """A4 reportlab document with the light bank-style statement header."""

    _MARGIN = 18 * mm
    _TOP = 42 * mm
    _BOTTOM = 18 * mm

    def __init__(self, *, date_label: str) -> None:
        self.buffer = BytesIO()
        self.story: list = []
        self.date_label = date_label

    def _on_page(self, canvas, doc) -> None:  # pragma: no cover - reportlab callback
        canvas._stmt_margin = self._MARGIN
        top = A4[1]
        canvas.saveState()

        # Title
        canvas.setFont(_BRAND_BOLD, 26)
        canvas.setFillColor(_LIGHT_HEADING)
        canvas.drawString(self._MARGIN, top - 22 * mm, "STATEMENT")
        # Gold underline beneath the title
        canvas.setStrokeColor(_LIGHT_GOLD)
        canvas.setLineWidth(2.6)
        canvas.line(self._MARGIN, top - 25.5 * mm, self._MARGIN + 46 * mm, top - 25.5 * mm)
        # DATE meta
        canvas.setFont(_BRAND_FONT, 10)
        canvas.setFillColor(_LIGHT_LABEL)
        canvas.drawString(self._MARGIN, top - 31 * mm, "DATE:")
        canvas.setFont(_BRAND_BOLD, 10)
        canvas.setFillColor(_LIGHT_HEADING)
        canvas.drawString(self._MARGIN + 15 * mm, top - 31 * mm, self.date_label)
        # PAGE meta is drawn by _PageCountingCanvas once the total is known.

        # Crest / logo (top-right)
        size = 24 * mm
        if _CREST.exists():
            try:
                canvas.drawImage(
                    str(_CREST),
                    A4[0] - self._MARGIN - size,
                    top - 8 * mm - size,
                    width=size,
                    height=size,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:  # noqa: BLE001
                pass
        canvas.restoreState()

    def build(self) -> bytes:
        doc = BaseDocTemplate(
            self.buffer,
            pagesize=A4,
            leftMargin=self._MARGIN,
            rightMargin=self._MARGIN,
            topMargin=self._TOP,
            bottomMargin=self._BOTTOM,
            )
        frame = Frame(
            doc.leftMargin,
            doc.bottomMargin,
            doc.width,
            doc.height,
            id="normal",
        )
        doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=self._on_page)])
        # NOTE: canvasmaker must be passed to build() — BaseDocTemplate.build()
        # uses the argument, not the constructor attribute.
        doc.build(self.story, canvasmaker=_PageCountingCanvas)
        return self.buffer.getvalue()


def _stmt_addr_blocks(blocks: list[tuple[str, list[str]]]) -> Table:
    """A horizontal strip of labelled address blocks (e.g. POSTAL | PHYSICAL)."""
    cells = []
    for label, lines in blocks:
        cell = [Paragraph(label, _STMT_ADDR_LABEL)]
        cell += [Paragraph(line, _STMT_ADDR) for line in lines]
        cells.append(cell)
    t = Table([cells], colWidths=[48 * mm] * len(cells))
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def _stmt_parties(to_name: str, *, to_address: str = "") -> Table:
    """FROM/TO party blocks — mirrors the HTML template's two columns."""
    from_cell = [
        Paragraph("FROM", _STMT_PARTY_LABEL),
        Paragraph(_SCHOOL_NAME, _STMT_PARTY_NAME),
        _stmt_addr_blocks(
            [
                ("POSTAL ADDRESS:", _CONTACT_LINES[0].split(", ")),
                ("PHYSICAL ADDRESS:", _CONTACT_LINES[1].split(", ")),
            ]
        ),
    ]
    cleaned = [
        ln.strip()
        for ln in to_address.replace(", ", "\n").split("\n")
        if ln.strip()
    ]
    to_cell = [
        Paragraph("TO", _STMT_PARTY_LABEL),
        Paragraph(to_name, _STMT_PARTY_NAME),
        _stmt_addr_blocks([("POSTAL ADDRESS:", cleaned or ["—"])]),
    ]
    t = Table([[from_cell, to_cell]], colWidths=[95 * mm, 85 * mm])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def _stmt_transactions(rows: list[dict]) -> Table:
    """Date | Reference | Description | Debit | Credit table (HTML statement)."""
    data = [
        [
            Paragraph("Date", _STMT_TABLE_HDR),
            Paragraph("Reference", _STMT_TABLE_HDR),
            Paragraph("Description", _STMT_TABLE_HDR),
            Paragraph("Debit", _STMT_TABLE_HDR_R),
            Paragraph("Credit", _STMT_TABLE_HDR_R),
        ]
    ]
    for r in rows:
        desc = r.get("description", "")
        bold = bool(r.get("bold"))
        is_open = bold and "brought forward" in desc.lower()
        is_close = bold and "carried forward" in desc.lower()

        debit = r.get("debit")
        credit = r.get("credit")
        if is_open:
            # HTML template opens with a zero credit; keep signed honesty.
            bal = Decimal(str(r.get("balance") or 0))
            if bal > 0:
                debit, credit = bal, None
            elif bal < 0:
                debit, credit = None, -bal
            else:
                debit, credit = None, Decimal("0")
        if is_close:
            debit = credit = None

        desc_style = _STMT_TABLE_BOLD if bold else _STMT_TABLE_DESC
        date_style = _STMT_TABLE_BOLD if bold else _STMT_TABLE_BODY
        money_style = _STMT_TABLE_MONEY_B if bold else _STMT_TABLE_MONEY
        data.append(
            [
                Paragraph(r.get("date", ""), date_style),
                Paragraph(r.get("reference") or "", _STMT_TABLE_BODY),
                Paragraph(desc, desc_style),
                Paragraph(money(debit) if debit is not None else "", money_style),
                Paragraph(money(credit) if credit is not None else "", money_style),
            ]
        )

    t = Table(
        data,
        colWidths=[28 * mm, 30 * mm, 72 * mm, 25 * mm, 25 * mm],
        repeatRows=1,
    )
    style = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, _LIGHT_BORDER),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, _LIGHT_BORDER_SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if rows:
        style.append(("LINEABOVE", (0, -1), (-1, -1), 0.9, _LIGHT_BORDER))
    t.setStyle(TableStyle(style))
    return t


def _stmt_totals(amount_due: Decimal, amount_paid: Decimal) -> Table:
    """Right-aligned 'Amount Due for 2026' / 'Amount Paid to date' rows."""
    rows = [
        [
            Paragraph("Amount Due for 2026", _STMT_TOTAL_LABEL),
            Paragraph(money(amount_due), _STMT_TOTAL_VALUE),
        ],
        [
            Paragraph("Amount Paid to date", _STMT_TOTAL_LABEL),
            Paragraph(money(amount_paid), _STMT_TOTAL_VALUE),
        ],
    ]
    t = Table(rows, colWidths=[110 * mm, 70 * mm])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return t


def _stmt_notes() -> Table:
    """Terms + bank payment instructions + sign-off (HTML statement footer)."""
    notes = [
        Paragraph(
            "Dear Parent/Guardian, please note the payment terms and instalment "
            "schedule for your account. Kindly settle each instalment by its due "
            "date. Please contact the Finance Office to make alternative payment "
            "arrangements.",
            _STMT_NOTE,
        ),
        Paragraph("Please make all payments with your reference number to:", _STMT_NOTE),
        Paragraph(
            f"{_SCHOOL_NAME}<br/>"
            f"{_BANK_NAME}<br/>"
            f"Account Number: {_BANK_ACCOUNT}<br/>"
            f"Branch Code: {_BANK_BRANCH}",
            _STMT_NOTE_BOLD,
        ),
        Spacer(1, 4 * mm),
        Paragraph("Kind Regards,<br/>Finance Department", _STMT_NOTE),
    ]
    t = Table([[notes]], colWidths=[180 * mm])
    t.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, -1), 0.6, _LIGHT_BORDER_SOFT),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
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
    account_name: str = "",
    account_address: str = "",
) -> bytes:
    """Light bank-style A4 statement matching the HTML statement template.

    The header (STATEMENT title, DATE/PAGE meta, crest) is drawn on the canvas
    with real page numbers; body flowables carry the parties, transactions
    table, totals and payment notes.

    *account_name* / *account_address* identify the customer in the TO block
    (normally the primary guardian); fall back to the student when absent.
    """
    issued = statement.generated_at or datetime.utcnow()
    doc = _StatementDocument(date_label=issued.strftime("%d/%m/%Y"))

    # TO name in accounting style: (number) LASTNAME, Firstname
    customer = (account_name or student_name or "").split()
    if len(customer) >= 2:
        to_name = f"({student_number}) {customer[-1]}, {' '.join(customer[:-1])}"
    else:
        to_name = f"({student_number}) {account_name or student_name}".strip()

    doc.story.extend(
        [
            Spacer(1, 2 * mm),
            _stmt_parties(to_name, to_address=account_address),
            Spacer(1, 8 * mm),
            _stmt_transactions(ledger or []),
            Spacer(1, 8 * mm),
            _stmt_totals(statement.current_amount_due, statement.total_payments),
            Spacer(1, 10 * mm),
            _stmt_notes(),
        ]
    )
    return doc.build()


def build_grade_summary_pdf(
    grade_name: str,
    academic_year: int,
    month: int,
    students: list[dict],
) -> bytes:
    """Build a grade-level summary PDF showing every student's payments and balance.

    Each dict in *students* must have:
        name, student_number, total_paid, balance, status
    """
    doc = _Document("GRADE STATEMENT SUMMARY")

    # ── Header ──────────────────────────────────────────────
    header_title = Paragraph(
        f'<font color="#FFFFFF"><b>Lambton Christian School</b></font>',
        _NORMAL,
    )
    header_sub = Paragraph(
        f'<font color="#C7CFE6">GRADE STATEMENT SUMMARY</font>',
        ParagraphStyle("R", parent=_NORMAL, alignment=TA_RIGHT),
    )
    header = Table([[header_title, header_sub]], colWidths=[110 * mm, 70 * mm])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    from app.services.statement import MONTHS
    month_name = MONTHS[month - 1] if 1 <= month <= 12 else str(month)
    period_label = f"{month_name} {academic_year}"

    fields = [
        ("Grade", grade_name),
        ("Statement Period", f"January – {period_label}"),
        ("Students", str(len(students))),
        ("Date Issued", datetime.now().strftime("%-d %b %Y")),
    ]
    cells = []
    for label, value in fields:
        cells.append(Paragraph(
            f'<font color="#94A3B8" size="7">{label.upper()}</font><br/>'
            f'<font color="#FFFFFF"><b>{value}</b></font>',
            _NORMAL,
        ))
    fields_t = Table([cells], colWidths=[45 * mm] * 4)
    fields_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    header_block = Table([[header], [fields_t]], colWidths=[180 * mm])
    header_block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _STMT_NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    doc.story.extend([header_block, Spacer(1, 6 * mm)])

    # ── Student table ───────────────────────────────────────
    _HEAD_STYLE = ParagraphStyle("GrdHead", parent=_NORMAL, fontName=_BRAND_BOLD, fontSize=9, textColor=colors.white)
    _CELL_STYLE = ParagraphStyle("GrdCell", parent=_NORMAL, fontSize=9)
    _MONEY_C = ParagraphStyle("GrdMoney", parent=_MONEY_STYLE, fontSize=9)
    _MONEY_R = ParagraphStyle("GrdMoneyR", parent=_MONEY_C, fontName=_BRAND_BOLD)
    _NAME_STYLE = ParagraphStyle("GrdName", parent=_NORMAL, fontSize=9, fontName=_BRAND_BOLD)

    data = [[
        Paragraph('<b>#</b>', _HEAD_STYLE),
        Paragraph('<b>Student Name</b>', _HEAD_STYLE),
        Paragraph('<b>Reg No</b>', _HEAD_STYLE),
        Paragraph('<b>Total Paid</b>', _HEAD_STYLE),
        Paragraph('<b>Balance Due</b>', _HEAD_STYLE),
        Paragraph('<b>Status</b>', _HEAD_STYLE),
    ]]

    total_paid_all = Decimal("0")
    total_balance_all = Decimal("0")

    for i, s in enumerate(students, 1):
        paid = Decimal(str(s.get("total_paid", 0)))
        bal = Decimal(str(s.get("balance", 0)))
        total_paid_all += paid
        total_balance_all += bal
        status = s.get("status", "")
        status_color = "#047857" if status == "Paid" else "#BE123C"
        data.append([
            Paragraph(str(i), _CELL_STYLE),
            Paragraph(s.get("name", ""), _NAME_STYLE),
            Paragraph(s.get("student_number", ""), _CELL_STYLE),
            Paragraph(money(paid), _MONEY_C),
            Paragraph(money(bal), _MONEY_R),
            Paragraph(f'<font color="{status_color}"><b>{status}</b></font>', _CELL_STYLE),
        ])

    # Totals row
    data.append([
        "",
        Paragraph('<b>TOTAL</b>', ParagraphStyle("Tot", parent=_NAME_STYLE, fontSize=10)),
        "",
        Paragraph(f'<b>{money(total_paid_all)}</b>', _MONEY_R),
        Paragraph(f'<b>{money(total_balance_all)}</b>', _MONEY_R),
        "",
    ])

    col_widths = [12 * mm, 58 * mm, 25 * mm, 30 * mm, 30 * mm, 25 * mm]
    t = Table(data, colWidths=col_widths, repeatRows=1)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), _STMT_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), _BRAND_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, _STMT_ROW_ALT]),
        # Totals row
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, _STMT_NAVY),
        ("BACKGROUND", (0, -1), (-1, -1), _GOLD_SOFT),
        ("FONTNAME", (0, -1), (-1, -1), _BRAND_BOLD),
    ]
    t.setStyle(TableStyle(style_cmds))
    doc.story.extend([t, Spacer(1, 8 * mm)])

    # ── Footer summary ──────────────────────────────────────
    paid_pct = (total_paid_all / (total_paid_all + total_balance_all) * 100) if (total_paid_all + total_balance_all) else 0
    summary_text = (
        f'<b>Grade Total:</b>  '
        f'Paid: <font color="#047857"><b>{money(total_paid_all)}</b></font>  |  '
        f'Outstanding: <font color="#BE123C"><b>{money(total_balance_all)}</b></font>  |  '
        f'Collection: <b>{paid_pct:.0f}%</b>'
    )
    summary = Paragraph(summary_text, ParagraphStyle("Summary", parent=_NORMAL, fontSize=10, leading=16))
    doc.story.extend([
        Table([[summary]], colWidths=[180 * mm]),
        Spacer(1, 6 * mm),
        Paragraph(
            '<font color="#94A3B8">Generated by Lambton Christian School Financial System</font>',
            ParagraphStyle("Foot", parent=_NORMAL, fontSize=8),
        ),
    ])

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
