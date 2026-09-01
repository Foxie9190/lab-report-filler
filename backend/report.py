"""
=============================================================================
  YOUR FILE #3 — turning everything into the actual report
=============================================================================

You get a LabReport object (all the form data), you return a string of
Markdown. The UI renders that string as the preview and saves it when you
hit Export.

This one is pure string-building — no APIs, no math. Good one to do first
if you want a quick win.

See BACKEND_GUIDE.md → Step 3.
"""

from __future__ import annotations

from .models import DataTable, LabReport, NotBuiltYet


def markdown_table(data: DataTable) -> str:
    """Turn a DataTable into a Markdown table.

    DONE for you — this is fiddly and not the interesting part.
    Returns "" if there's no data, so you can safely drop it into an f-string.
    """
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
    """Turn a multi-line string into Markdown bullets. DONE for you."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(f"- {ln}" for ln in lines)


def numbered_list(text: str) -> str:
    """Turn a multi-line string into a numbered list. DONE for you."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(f"{i}. {ln}" for i, ln in enumerate(lines, 1))


# ---------------------------------------------------------------------------
# YOUR TURN
# ---------------------------------------------------------------------------


def build_report(report: LabReport) -> str:
    """Build the whole lab report as a Markdown string.

    A solid structure to aim for (change it to match what your teacher wants):

        # <title>
        **Name:** ...  **Class:** ...  **Date:** ...  **Partners:** ...

        ## Purpose
        ## Hypothesis
        ## Materials          <- bullet_list(report.content.materials)
        ## Procedure          <- numbered_list(report.content.procedure)
        ## Data               <- markdown_table(report.data)
        ## Calculations       <- loop over report.calculations
        ## Observations
        ## Conclusion

    Tips:
      - Build a list of string chunks and "\\n\\n".join(chunks) at the end.
        Way easier than one giant f-string.
      - Skip empty sections instead of printing a blank heading.
      - For each CalcResult c, you have c.name, c.formula, c.work, and
        c.pretty() for the formatted answer.
    """
    raise NotBuiltYet("Step 3 — build_report in backend/report.py")


def suggest_conclusion(report: LabReport) -> str:
    """OPTIONAL BONUS, do this last (or never).

    Write a draft conclusion paragraph from the data + calculations, so the
    app gives you a starting point instead of a blank box.

    Two ways to do it:
      a) Templates + f-strings — no API needed, totally predictable.
      b) Send the report to Claude's API like vision.py does and ask for a
         paragraph.

    Be honest with yourself about (b): a conclusion is the part your teacher
    is actually grading you on. Use it as a first draft you rewrite, not as
    something to paste in. Check your school's rules on AI too.
    """
    raise NotBuiltYet("Bonus — suggest_conclusion in backend/report.py")
