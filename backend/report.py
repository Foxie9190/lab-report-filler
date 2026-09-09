from __future__ import annotations

from .models import DataTable, LabReport, NotBuiltYet


def markdown_table(data: DataTable) -> str:

    if not data.headers or not data.rows:
        return ""
    head = "| " + " | ".join(data.headers) + " |"
    sep = "| " + " | ".join("---" for _ in data.headers) + " |"
    body = []
    for row in data.rows:
        cells = list(row) + [""] * (len(data.headers) - len(row))
        body.append("| " + " | ".join(cells[: len(data.headers)]) + " |")
    return "\n".join([head, sep, *body])


def bullet_list(text: str) -> str:
    """Turn a multi-line string into Markdown bullets."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(f"- {ln}" for ln in lines)


def numbered_list(text: str) -> str:
    """Turn a multi-line string into a numbered list"""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(f"{i}. {ln}" for i, ln in enumerate(lines, 1))


# ---------------------------------------------------------------------------
# The report itself
# ---------------------------------------------------------------------------


def build_report(report: LabReport) -> str:
    Info = report.info
    Content = report.content
    AnalysisQuestions = report.analysis
    Calcs = report.calculations
    table = []

    table.append(f"{Info.title or 'LabReport'}")
    table.append(
        f"**Name:** {Info.student_name} \n **Class:** {Info.course} \n **Date:** {Info.date} \n **Lab Partner/Partners:** {Info.partners}"
    )

    if Content.materials:
        table.append("# Material List\n\n" + bullet_list(Content.materials))

    if AnalysisQuestions:
        Questions = []
        for i, Q in enumerate(AnalysisQuestions, 1):
            Questions.append(f"**{i}. {Q.question}**\n\n{Q.answer}")
        table.append("## Analysis Questions\n\n" + "\n\n".join(Questions))

    if Calcs:
        calculatons = []
        for cal in Calcs:
            calculatons.append(f"**{cal.name} = {cal.pretty()}**\n\n {cal.work}")
        table.append("## Calculations\n\n" + "\n\n".join(calculatons))

    # One report can have several tables. Each prints under its own name.
    data_chunks = []
    for i, dt in enumerate(report.tables, 1):
        md = markdown_table(dt)
        if md:
            data_chunks.append(f"**{dt.title or f'Table {i}'}**\n\n{md}")
    if data_chunks:
        table.append("## Data\n\n" + "\n\n".join(data_chunks))

    return "\n\n".join(table)
