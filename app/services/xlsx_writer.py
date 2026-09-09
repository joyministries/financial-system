"""Minimal stdlib-only XLSX writer (zipfile + OOXML XML).

Used as a fallback for report exports when ``openpyxl`` is unavailable in
the deployment runtime (e.g. Vercel serverless functions where spreadsheet
dependencies can fail to bundle). Produces a valid SpreadsheetML package
readable by Excel, LibreOffice, and openpyxl.

Only supports what the school's suspension-list export needs: a single
styled header row (bold, yellow fill), plain text/number rows, fixed
column widths, and an optional SUM formula footer row.
"""

from __future__ import annotations

import xml.sax.saxutils as saxutils
import zipfile
from collections.abc import Iterable, Sequence
from io import BytesIO

def _escape(value: str) -> str:
    # saxutils.escape default dict already handles &, <, > and escaping
    # them again would double-escape (e.g. & -> &amp;amp;). Quotes only
    # need escaping in attribute values; they're harmless in text nodes.
    return saxutils.escape(value)


def _escape_attr(value: str) -> str:
    # For XML attribute values where double/single quotes must be escaped.
    return saxutils.quoteattr(value)[1:-1]


def build_suspension_list_xlsx(
    *,
    sheet_label: str,
    headers: Sequence[str],
    data_rows: Iterable[Sequence[str | float | None]],
    column_widths: Sequence[tuple[str, float]] | None = None,
    sum_footer: bool = False,
    sum_total: float = 0.0,
) -> BytesIO:
    """Build an .xlsx workbook with one styled sheet.

    Args:
        sheet_label: Workbook sheet title (<=31 chars).
        headers: Header row labels.
        data_rows: Row cells; ``str`` -> inline string, ``float`` ->
            number, ``None`` -> empty cell.
        column_widths: (column letter, width) pairs, e.g. ("A", 56.89).
        sum_footer: Append a footer row with ``=SUM(C2:C{last})`` in the
            third column (0-indexed header position 2).
        sum_total: Cached value for the SUM formula cell.
    """
    sheet_name = _safe_sheet_name(sheet_label)

    data = list(data_rows)
    total_rows = 1 + len(data) + (1 if sum_footer and data else 0)

    row_xml: list[str] = [_header_row(headers)]
    for idx, values in enumerate(data):
        row_xml.append(_data_row(idx + 2, values))
    if sum_footer and data:
        row_xml.append(_sum_footer_row(len(data), sum_total))

    dimension = _dimension_ref(len(headers), total_rows)

    sheet_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="{dimension}"/>
{_cols_xml(column_widths or [])}<sheetData>{''.join(row_xml)}</sheetData>
</worksheet>
"""

    parts = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
""",
        "xl/workbook.xml": f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="{_escape_attr(sheet_name)}" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>
""",
        "xl/_rels/workbook.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
""",
        "xl/styles.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>
</fills>
<borders count="1">
<border><left/><right/><top/><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
</cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1">
<cellStyle name="Normal" xfId="0" builtinId="0"/>
</cellStyles>
</styleSheet>
""",
        "xl/worksheets/sheet1.xml": sheet_xml,
    }

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in parts.items():
            zf.writestr(name, content)
    buf.seek(0)
    return buf


def _safe_sheet_name(label: str) -> str:
    cleaned = "".join(c for c in label if c not in "[]:*?/\\")
    return cleaned[:31] or "Sheet1"


def _cols_xml(widths: Sequence[tuple[str, float]]) -> str:
    if not widths:
        return ""
    cols = []
    for letter, width in widths:
        idx = _col_index(letter)
        cols.append(f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>')
    return f"<cols>{''.join(cols)}</cols>"


def _col_index(letter: str) -> int:
    index = 0
    for ch in letter.upper():
        index = index * 26 + (ord(ch) - ord("A") + 1)
    return index


def _column_letter(index: int) -> str:
    letters = ""
    while index > 0:
        index, rem = divmod(index - 1, 26)
        letters = chr(ord("A") + rem) + letters
    return letters


def _dimension_ref(num_cols: int, num_rows: int) -> str:
    if num_rows == 0 or num_cols == 0:
        return "A1"
    return f"A1:{_column_letter(num_cols)}{num_rows}"


def _header_row(headers: Sequence[str]) -> str:
    cells = []
    for i, header in enumerate(headers):
        coord = f"{_column_letter(i + 1)}1"
        # Match the openpyxl version: A left, B/C/E center, D default.
        style = "1" if i == 0 else "2" if i in (1, 2, 4) else "0"
        cells.append(
            f'<c r="{coord}" t="inlineStr" s="{style}"><is><t>{_escape(str(header))}</t></is></c>'
        )
    joined = "".join(cells)
    return '<row r="1">' + joined + "</row>"


def _data_row(row_num: int, values: Sequence[str | float | None]) -> str:
    cells = []
    for i, value in enumerate(values):
        coord = f"{_column_letter(i + 1)}{row_num}"
        if value is None:
            continue
        if isinstance(value, float):
            cells.append(f'<c r="{coord}"><v>{value!r}</v></c>')
        else:
            cells.append(
                f'<c r="{coord}" t="inlineStr"><is><t>{_escape(str(value))}</t></is></c>'
            )
    joined = "".join(cells)
    return '<row r="' + str(row_num) + '">' + joined + "</row>"


def _sum_footer_row(num_data_rows: int, sum_total: float) -> str:
    """Footer row: 'OUTSTANDING BALANCE' in B, =SUM(C2:C{last}) in C."""
    footer_row = num_data_rows + 2
    last_data_row = num_data_rows + 1
    b = (
        f'<c r="B{footer_row}" t="inlineStr">'
        "<is><t>OUTSTANDING BALANCE</t></is></c>"
    )
    formula = (
        f'<c r="C{footer_row}">'
        f"<f>SUM(C2:C{last_data_row})</f>"
        f"<v>{sum_total!r}</v></c>"
    )
    return '<row r="' + str(footer_row) + '">' + b + formula + "</row>"