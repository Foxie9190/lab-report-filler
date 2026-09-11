"""
Shared data shapes for the Lab Report Filler.

This file is the CONTRACT between the UI (ui/) and the backend (backend/).
Both sides agree on these objects, so you can rewrite the backend however you
want as long as your functions take and return these.

Read this one first — everything else makes more sense once you know
these objects.

The report template these follow:
    Title of lab -> LabInfo.title
    Material list -> LabContent.materials
    Safety precautions -> LabContent.safety
    Data tables -> list[DataTable]  (report.tables)
    Analysis questions -> list[AnalysisQuestion]
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class LabInfo:
    """The header stuff — who/what/when."""

    title: str = ""
    student_name: str = ""
    course: str = ""
    teacher: str = ""
    date: str = ""
    partners: str = ""


@dataclass
class LabContent:
    """The written sections of the report.

    Both are plain multi-line strings — one item per line — because that's
    what a textarea gives you.
    """

    materials: str = ""  # one material per line
    safety: str = ""  # one precaution per line


@dataclass
class AnalysisQuestion:
    """One analysis question and the answer you wrote for it.

    The UI gives you a question box and an answer box per row, so this is
    just the pair. Both are strings; either can be blank.
    """

    question: str = ""
    answer: str = ""


@dataclass
class DataTable:
    """One measurements table. A report can have several.

    title:   e.g. "Trial masses" — optional, printed above the table
    headers: e.g. ["Trial", "Mass (g)", "Volume (mL)"]
    rows:    e.g. [["1", "12.4", "5.0"], ["2", "12.6", "5.1"]]

    Everything is a string because it comes straight out of text boxes.
    Convert to float in your chem functions (and handle blanks!).
    """

    title: str = ""
    headers: list[str] = field(
        default_factory=lambda: ["Trial", "Measurement", "Units"]
    )
    rows: list[list[str]] = field(default_factory=list)

    def column(self, header: str) -> list[str]:
        """Grab one column by its header name. Returns [] if not found."""
        if header not in self.headers:
            return []
        i = self.headers.index(header)
        return [r[i] for r in self.rows if i < len(r)]


# Superscript digits, so an exponent can sit inline in ordinary text.
_SUPERSCRIPT = str.maketrans("-0123456789", "\u207b\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079")

# Matches Python's e-notation inside a longer string, e.g. "6.022e+23".
_E_NOTATION = re.compile(r"(-?\d+\.?\d*)[eE]([+-]?\d+)")


def to_scientific(value: float, digits: int = 4) -> str:
    """6.022e+23 -> '6.022 x 10^23', written with real superscript digits.

    Falls back to a plain number when the exponent is 0, so 8.0 stays "8"
    instead of becoming "8 x 10^0".
    """
    if value == 0:
        return "0"
    mantissa, _, exponent = f"{value:.{max(digits - 1, 0)}e}".partition("e")
    mantissa = mantissa.rstrip("0").rstrip(".") or "0"
    power = int(exponent)
    if power == 0:
        return mantissa
    return f"{mantissa} \u00d7 10{str(power).translate(_SUPERSCRIPT)}"


def sci_text(text: str) -> str:
    """Rewrite every e-notation number inside a string, so a shown-work
    line reads the same way as the answer above it."""

    def swap(m: "re.Match[str]") -> str:
        power = int(m.group(2))
        mantissa = m.group(1).rstrip("0").rstrip(".") or "0"
        if power == 0:
            return mantissa
        return f"{mantissa} \u00d7 10{str(power).translate(_SUPERSCRIPT)}"

    return _E_NOTATION.sub(swap, text)


@dataclass
class CalcResult:
    """One finished calculation, ready to print in the report.


    name:    "Percent Error"
    formula: "|experimental - accepted| / accepted x 100"
    value:   2.34
    unit:    "%"
    work:    the shown work, as a string, e.g.
             "|8.7 - 8.9| / 8.9 x 100 = 2.25%"
    sci:     print the answer in scientific notation. The UI sets this
             from its Scientific notation checkbox; nothing in chem.py
             needs to care.
    """

    name: str
    formula: str
    value: float
    unit: str = ""
    work: str = ""
    sci: bool = False

    def pretty(self) -> str:
        number = to_scientific(self.value) if self.sci else f"{self.value:.4g}"
        return f"{number}{(' ' + self.unit) if self.unit else ''}"


@dataclass
class LabReport:
    """Everything, bundled. This is what report.build_report() receives."""

    info: LabInfo = field(default_factory=LabInfo)
    content: LabContent = field(default_factory=LabContent)
    tables: list[DataTable] = field(default_factory=list)  # in the order shown
    calculations: list[CalcResult] = field(default_factory=list)
    analysis: list[AnalysisQuestion] = field(default_factory=list)


class NotBuiltYet(NotImplementedError):
    """Raised by the stub functions you haven't written yet.

    The UI catches this and shows a friendly 'this part is yours' banner
    instead of crashing, so the app always runs.
    """

    def __init__(self, step: str):
        super().__init__(step)
        self.step = step
