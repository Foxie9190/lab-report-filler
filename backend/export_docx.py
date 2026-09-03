"""
Word (.docx) export. Claude's file — the plumbing, not the science.

You give it the same LabReport that build_report() gets, it hands back the
bytes of a .docx file. The UI writes those bytes to wherever you pick.

Why this doesn't just convert your Markdown: Markdown tables are pipes and
dashes. Word wants a real table object, real bullet lists, real headings.
Building straight from the LabReport gets you a document that looks like a
document instead of a text file with symbols in it.

Needs python-docx:  pip install python-docx
"""

from __future__ import annotations

from io import BytesIO

from .models import LabReport


class DocxNotInstalled(RuntimeError):
    """Raised when python-docx isn't available, so the UI can say so nicely."""


def _lines(text: str) -> list[str]:
    """Split a multi-line box into clean, non-empty lines."""
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def build_docx(report: LabReport) -> bytes:
    """Turn a LabReport into the bytes of a Word document.

    Same five sections as the Markdown report, in the same order:
    title, material list, safety precautions, data, calculations,
    analysis questions.
    """
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise DocxNotInstalled(
            "Word export needs python-docx. Run:  pip install python-docx"
        ) from exc

    info = report.info
    content = report.content
    doc = Document()

    # --- title -----------------------------------------------------------
    doc.add_heading(info.title or "Lab Report", level=0)

    # --- who / what / when, as one compact block -------------------------
    header_bits = [
        ("Name", info.student_name),
        ("Class", info.course),
        ("Teacher", info.teacher),
        ("Date", info.date),
        ("Lab partners", info.partners),
    ]
    filled = [(k, v) for k, v in header_bits if v.strip()]
    if filled:
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for i, (key, value) in enumerate(filled):
            if i:
                para.add_run("\n")
            para.add_run(f"{key}: ").bold = True
            para.add_run(value)

    # --- material list ---------------------------------------------------
    materials = _lines(content.materials)
    if materials:
        doc.add_heading("Material list", level=1)
        for item in materials:
            doc.add_paragraph(item, style="List Bullet")

    # --- safety precautions ----------------------------------------------
    safety = _lines(content.safety)
    if safety:
        doc.add_heading("Safety precautions", level=1)
        for item in safety:
            doc.add_paragraph(item, style="List Bullet")

    # --- data table ------------------------------------------------------
    data = report.data
    if data.headers and data.rows:
        doc.add_heading("Data", level=1)
        table = doc.add_table(rows=1, cols=len(data.headers))
        table.style = "Table Grid"

        for cell, header in zip(table.rows[0].cells, data.headers):
            cell.text = ""
            run = cell.paragraphs[0].add_run(str(header))
            run.bold = True

        for row in data.rows:
            cells = table.add_row().cells
            for i, cell in enumerate(cells):
                cell.text = str(row[i]) if i < len(row) else ""

    # --- calculations ----------------------------------------------------
    if report.calculations:
        doc.add_heading("Calculations", level=1)
        for calc in report.calculations:
            headline = doc.add_paragraph()
            headline.paragraph_format.space_before = Pt(10)
            headline.paragraph_format.space_after = Pt(2)
            headline.add_run(f"{calc.name} = {calc.pretty()}").bold = True

            # Shown work: one paragraph per line, indented and monospaced so
            # it reads like worked-out math instead of prose.
            for line in (calc.work or calc.formula or "").splitlines():
                if not line.strip():
                    continue
                work = doc.add_paragraph()
                work.paragraph_format.left_indent = Pt(24)
                work.paragraph_format.space_after = Pt(0)
                run = work.add_run(line.strip())
                run.font.name = "Courier New"
                run.font.size = Pt(10)

    # --- analysis questions ----------------------------------------------
    if report.analysis:
        doc.add_heading("Analysis questions", level=1)
        for i, item in enumerate(report.analysis, 1):
            question = doc.add_paragraph()
            question.paragraph_format.space_after = Pt(2)
            question.add_run(f"{i}. {item.question}").bold = True

            answer = doc.add_paragraph(item.answer or "")
            answer.paragraph_format.left_indent = Pt(24)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
