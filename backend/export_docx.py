"""
Word (.docx) export.

You give it the same LabReport that build_report() gets, it hands back the
bytes of a .docx file. The UI writes those bytes to wherever you pick.

Why this doesn't just convert the Markdown report: Markdown tables are pipes and
dashes. Word wants a real table object, real bullet lists, real headings.
Building straight from the LabReport gets you a document that looks like a
document instead of a text file with symbols in it.

Themes live in THEMES below. Each one is six colours. Add a new entry and
it shows up in the app's Theme dropdown automatically.

Needs python-docx:  pip install python-docx
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from .models import LabReport

# ---------------------------------------------------------------------------
# Themes — six colours each. Keys are what the dropdown shows.
#   accent  headings, table header, Q badges, box edges
#   dark    the title band
#   light   striped rows, info strip
#   box     calculation / answer boxes
#   ink     body text
#   muted   secondary text (formulas, "not answered")
# ---------------------------------------------------------------------------
THEMES: dict[str, dict[str, str]] = {
    "Teal": {
        "accent": "00796B", "dark": "004D40", "light": "E0F2F1",
        "box": "F4F7F7", "ink": "212121", "muted": "5F6B6B",
    },
    "Navy": {
        "accent": "1E4E8C", "dark": "0F2C4F", "light": "E3ECF6",
        "box": "F3F6FA", "ink": "1B1F24", "muted": "5C6773",
    },
    "Crimson": {
        "accent": "B0263A", "dark": "6E1220", "light": "F9E4E7",
        "box": "FAF4F5", "ink": "231A1B", "muted": "7A6265",
    },
    "Forest": {
        "accent": "2E7D32", "dark": "1B4D1E", "light": "E6F2E6",
        "box": "F4F8F4", "ink": "1C221C", "muted": "5E6B5E",
    },
    "Plum": {
        "accent": "6A3FA0", "dark": "3D2263", "light": "EEE7F7",
        "box": "F7F4FA", "ink": "1F1A26", "muted": "6B6076",
    },
    "Slate (print-friendly)": {
        "accent": "37474F", "dark": "263238", "light": "ECEFF1",
        "box": "F5F7F8", "ink": "1E1E1E", "muted": "6B7378",
    },
}

DEFAULT_THEME = "Teal"
BODY_FONT = "Calibri"
MONO_FONT = "Consolas"
WHITE = "FFFFFF"


@dataclass
class DocxOptions:
    """Everything the user can choose before hitting Save as Word."""

    theme: str = DEFAULT_THEME
    show_formulas: bool = True     # the grey italic formula under each calc
    striped_rows: bool = True      # alternate shading on data table rows
    mark_unanswered: bool = True   # print "(not answered)" for blank answers


class DocxNotInstalled(RuntimeError):
    """Raised when python-docx isn't available, so the UI can say so nicely."""


def theme_names() -> list[str]:
    """For the dropdown."""
    return list(THEMES)


def _lines(text: str) -> list[str]:
    """Split a multi-line box into clean, non-empty lines."""
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def build_docx(report: LabReport, options: DocxOptions | None = None) -> bytes:
    """Turn a LabReport into the bytes of a Word document.

    Same five sections as the Markdown report, in the same order:
    title, material list, safety precautions, data, calculations,
    analysis questions.
    """
    try:
        from docx import Document
        from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        from docx.shared import Inches, Pt, RGBColor
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise DocxNotInstalled(
            "Word export needs python-docx. Run:  pip install python-docx"
        ) from exc

    opts = options or DocxOptions()
    pal = THEMES.get(opts.theme, THEMES[DEFAULT_THEME])
    ACCENT, DARK, LIGHT = pal["accent"], pal["dark"], pal["light"]
    BOX, INK, MUTED = pal["box"], pal["ink"], pal["muted"]

    # ------------------------------------------------------------------
    # small helpers — python-docx has no API for shading or borders, so
    # these poke the underlying XML. Each one does exactly one thing.
    # ------------------------------------------------------------------
    def rgb(hex_code: str) -> RGBColor:
        return RGBColor.from_string(hex_code)

    def shade(element, hex_fill: str):
        """Background colour on a paragraph (pPr) or table cell (tcPr)."""
        pr = (
            element.get_or_add_pPr()
            if hasattr(element, "get_or_add_pPr")
            else element._tc.get_or_add_tcPr()
        )
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), hex_fill)
        pr.append(shd)

    def paragraph_border(paragraph, side: str, hex_color: str, size: int = 8, space: int = 1):
        pPr = paragraph._p.get_or_add_pPr()
        pBdr = pPr.find(qn("w:pBdr"))
        if pBdr is None:
            pBdr = OxmlElement("w:pBdr")
            pPr.append(pBdr)
        edge = OxmlElement(f"w:{side}")
        edge.set(qn("w:val"), "single")
        edge.set(qn("w:sz"), str(size))
        edge.set(qn("w:space"), str(space))
        edge.set(qn("w:color"), hex_color)
        pBdr.append(edge)

    def cell_borders(cell, hex_color: str, size: int = 4, sides=("top", "left", "bottom", "right")):
        tcPr = cell._tc.get_or_add_tcPr()
        borders = OxmlElement("w:tcBorders")
        for side in sides:
            edge = OxmlElement(f"w:{side}")
            edge.set(qn("w:val"), "single")
            edge.set(qn("w:sz"), str(size))
            edge.set(qn("w:color"), hex_color)
            borders.append(edge)
        tcPr.append(borders)

    def cell_margins(cell, top=80, bottom=80, left=120, right=120):
        tcPr = cell._tc.get_or_add_tcPr()
        mar = OxmlElement("w:tcMar")
        for side, val in (("top", top), ("bottom", bottom), ("start", left), ("end", right)):
            m = OxmlElement(f"w:{side}")
            m.set(qn("w:w"), str(val))
            m.set(qn("w:type"), "dxa")
            mar.append(m)
        tcPr.append(mar)

    def strip_table_borders(table):
        tblPr = table._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            edge = OxmlElement(f"w:{side}")
            edge.set(qn("w:val"), "nil")
            borders.append(edge)
        tblPr.append(borders)

    def run_style(run, size=11, bold=False, color=INK, font=BODY_FONT, italic=False):
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = rgb(color)
        run.font.name = font
        run._element.rPr.rFonts.set(qn("w:eastAsia"), font)

    def spacing(paragraph, before=0, after=0):
        fmt = paragraph.paragraph_format
        fmt.space_before = Pt(before)
        fmt.space_after = Pt(after)

    def section_heading(text: str):
        p = doc.add_paragraph()
        spacing(p, before=18, after=6)
        paragraph_border(p, "bottom", ACCENT, size=12, space=2)
        run_style(p.add_run(text.upper()), size=13, bold=True, color=ACCENT)
        rPr = p.runs[0]._element.get_or_add_rPr()
        sp = OxmlElement("w:spacing")
        sp.set(qn("w:val"), "20")
        rPr.append(sp)
        return p

    def boxed(fill: str, accent: str | None = None):
        """A one-cell table used as a coloured box. Returns the cell."""
        t = doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = True
        strip_table_borders(t)
        cell = t.rows[0].cells[0]
        shade(cell, fill)
        cell_margins(cell, top=100, bottom=100, left=160, right=160)
        if accent:
            cell_borders(cell, accent, size=18, sides=("left",))
        return cell

    def bullet(text: str):
        p = doc.add_paragraph(style="List Bullet")
        spacing(p, after=3)
        run_style(p.add_run(text), size=11)
        return p

    # ------------------------------------------------------------------
    # page setup
    # ------------------------------------------------------------------
    info = report.info
    content = report.content
    doc = Document()

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Inches(8.5), Inches(11)
    sec.left_margin = sec.right_margin = Inches(0.9)
    sec.top_margin = sec.bottom_margin = Inches(0.8)

    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(11)
    normal.font.color.rgb = rgb(INK)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)

    # ------------------------------------------------------------------
    # title band
    # ------------------------------------------------------------------
    band = boxed(DARK)
    p = band.paragraphs[0]
    spacing(p, before=6, after=2)
    run_style(p.add_run("CHEMISTRY LAB REPORT"), size=9, bold=True, color=LIGHT)
    p2 = band.add_paragraph()
    spacing(p2, before=0, after=6)
    run_style(p2.add_run(info.title or "Lab Report"), size=24, bold=True, color=WHITE)

    # ------------------------------------------------------------------
    # who / what / when
    # ------------------------------------------------------------------
    header_bits = [
        ("Name", info.student_name),
        ("Class", info.course),
        ("Teacher", info.teacher),
        ("Date", info.date),
        ("Lab partners", info.partners),
    ]
    filled = [(k, v.strip()) for k, v in header_bits if v.strip()]
    if filled:
        cols = 2
        rows = (len(filled) + cols - 1) // cols
        t = doc.add_table(rows=rows, cols=cols)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        strip_table_borders(t)
        for i, (key, value) in enumerate(filled):
            cell = t.rows[i // cols].cells[i % cols]
            shade(cell, LIGHT)
            cell_margins(cell, top=70, bottom=70, left=160, right=120)
            cp = cell.paragraphs[0]
            spacing(cp)
            run_style(cp.add_run(f"{key.upper()}  "), size=8, bold=True, color=ACCENT)
            run_style(cp.add_run(value), size=11, color=INK)
        if len(filled) % cols:
            last = t.rows[-1].cells[-1]
            shade(last, LIGHT)
            cell_margins(last, top=70, bottom=70)

    # ------------------------------------------------------------------
    # material list / safety precautions
    # ------------------------------------------------------------------
    materials = _lines(content.materials)
    if materials:
        section_heading("Material list")
        for item in materials:
            bullet(item)

    safety = _lines(content.safety)
    if safety:
        section_heading("Safety precautions")
        for item in safety:
            bullet(item)

    # ------------------------------------------------------------------
    # data tables — one report can have several
    # ------------------------------------------------------------------
    real_tables = [dt for dt in report.tables if dt.headers and dt.rows]
    if real_tables:
        section_heading("Data")
        for n, data in enumerate(real_tables, 1):
            cap = doc.add_paragraph()
            spacing(cap, before=8 if n > 1 else 2, after=4)
            run_style(cap.add_run(data.title or f"Table {n}"), size=10.5, bold=True, color=ACCENT)

            t = doc.add_table(rows=1, cols=len(data.headers))
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            strip_table_borders(t)

            for cell, header in zip(t.rows[0].cells, data.headers):
                shade(cell, ACCENT)
                cell_margins(cell)
                cp = cell.paragraphs[0]
                cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                spacing(cp)
                run_style(cp.add_run(str(header)), size=10, bold=True, color=WHITE)

            for r, row in enumerate(data.rows):
                cells = t.add_row().cells
                fill = LIGHT if (opts.striped_rows and r % 2 == 0) else WHITE
                for i, cell in enumerate(cells):
                    shade(cell, fill)
                    cell_margins(cell)
                    cell_borders(cell, LIGHT, size=4, sides=("bottom",))
                    cp = cell.paragraphs[0]
                    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    spacing(cp)
                    run_style(cp.add_run(str(row[i]) if i < len(row) else ""), size=10.5)

    # ------------------------------------------------------------------
    # calculations
    # ------------------------------------------------------------------
    if report.calculations:
        section_heading("Calculations")
        for calc in report.calculations:
            gap = doc.add_paragraph()
            spacing(gap, after=0)
            gap.paragraph_format.line_spacing = Pt(6)

            box = boxed(BOX, accent=ACCENT)
            head = box.paragraphs[0]
            spacing(head, after=2)
            run_style(head.add_run(calc.name), size=11, bold=True, color=ACCENT)
            run_style(head.add_run("   =   "), size=11, color=MUTED)
            run_style(head.add_run(calc.pretty()), size=13, bold=True, color=INK)

            if opts.show_formulas and calc.formula:
                fp = box.add_paragraph()
                spacing(fp, after=4)
                run_style(fp.add_run(calc.formula), size=9, italic=True, color=MUTED)

            for line in (calc.work or "").splitlines():
                if not line.strip():
                    continue
                wp = box.add_paragraph()
                spacing(wp, after=0)
                wp.paragraph_format.left_indent = Pt(10)
                run_style(wp.add_run(line.strip()), size=10, color=INK, font=MONO_FONT)

    # ------------------------------------------------------------------
    # analysis questions
    # ------------------------------------------------------------------
    if report.analysis:
        section_heading("Analysis questions")
        for i, item in enumerate(report.analysis, 1):
            qp = doc.add_paragraph()
            spacing(qp, before=10, after=3)
            run_style(qp.add_run(f"Q{i}  "), size=11, bold=True, color=ACCENT)
            run_style(qp.add_run(item.question), size=11, bold=True, color=INK)

            box = boxed(BOX, accent=LIGHT)
            ap = box.paragraphs[0]
            spacing(ap)
            answer = item.answer.strip()
            if answer:
                run_style(ap.add_run(answer), size=11, color=INK)
            elif opts.mark_unanswered:
                run_style(ap.add_run("(not answered)"), size=10, italic=True, color=MUTED)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
