"""
The whole user interface. Claude's file.

You shouldn't need to edit this to get the app working — it already calls
every backend function you're going to write. But it's plain Flet, so poke
at it once things run.

How it talks to your backend:
    backend.chem.CALCULATIONS        -> builds the calculation dropdown
    backend.report.build_report(...) -> the Generate button

If one of your functions still raises NotBuiltYet, the app shows an amber
"this part is yours" strip instead of crashing.
"""

from __future__ import annotations

import re

import flet as ft

from backend import chem, export_docx, report as report_mod, updates
from backend.models import (
    AnalysisQuestion,
    CalcResult,
    DataTable,
    LabContent,
    LabInfo,
    LabReport,
    NotBuiltYet,
)

from .theme import ACCENT, MAX_WIDTH, SEED, banner, field, section


# Default unit for each calculation — used to prefill the Unit box.
# Anything not listed here starts blank. Add your own calculations here
# if you want their units prefilled too.
# Calculations that take one LIST of numbers instead of a fixed set of boxes.
# These get the "add a value at a time" entry instead of one box per label.
LIST_INPUTS = {"average"}

UNIT_HINTS = {
    "percent_error": "%",
    "percent_yield": "%",
    "density": "g/mL",
    "moles_from_grams": "mol",
    "molarity": "M",
}


def _swap_unit(work: str, old: str, new: str) -> str:
    """Rewrite the unit inside a shown-work string when it gets overridden.

    Only replaces the unit as a standalone token, so the "g" in "grams"
    is left alone.
    """
    if not work or not old or old == new:
        return work
    pattern = r"(?<![A-Za-z0-9])" + re.escape(old) + r"(?![A-Za-z0-9])"
    out = re.sub(pattern, new, work)
    if not new:  # unit removed — tidy up the gap it left behind
        out = re.sub(r"[ \t]+(\n|$)", r"\1", re.sub(r"[ \t]{2,}", " ", out))
    return out


class LabReportApp:
    def __init__(self, page: ft.Page):
        self.page = page
        # Each table: {"title": str, "headers": [..], "rows": [[..], ..]}
        self.tables: list[dict] = [self._blank_table()]
        # each entry is [question, answer]
        self.analysis: list[list[str]] = [["", ""], ["", ""], ["", ""]]
        self.calc_results = []
        # numbers confirmed one at a time for list calculations (Average)
        self.avg_values: list[float] = []

        self._setup_page()
        # FilePicker is a service — it registers itself, but we must keep a
        # reference alive or it gets garbage-collected out of the registry.
        # Used by the Save button.
        self.picker = ft.FilePicker()

        self._build()

    # -- page chrome ------------------------------------------------------
    def _setup_page(self):
        p = self.page
        p.title = "Lab Report Filler"
        p.theme = ft.Theme(color_scheme_seed=SEED)
        p.dark_theme = ft.Theme(color_scheme_seed=SEED)
        p.theme_mode = ft.ThemeMode.LIGHT
        p.scroll = ft.ScrollMode.AUTO
        p.padding = 0

    def _toggle_theme(self, e):
        self.page.theme_mode = (
            ft.ThemeMode.DARK
            if self.page.theme_mode == ft.ThemeMode.LIGHT
            else ft.ThemeMode.LIGHT
        )

    def toast(self, msg: str):
        self.page.show_dialog(ft.SnackBar(ft.Text(msg)))

    # -- build ------------------------------------------------------------
    def _build(self):
        header = ft.Container(
            content=ft.Row(
                [
                    ft.Icon(ft.Icons.SCIENCE, color=ft.Colors.WHITE, size=30),
                    ft.Column(
                        [
                            ft.Text(
                                "Lab Report Filler",
                                size=22,
                                weight=ft.FontWeight.BOLD,
                                color=ft.Colors.WHITE,
                            ),
                            ft.Text(
                                f"Chemistry lab reports, done right  ·  v{updates.VERSION}",
                                size=12,
                                color=ft.Colors.WHITE70,
                            ),
                        ],
                        spacing=0,
                        expand=True,
                    ),
                    ft.IconButton(
                        icon=ft.Icons.BRIGHTNESS_6,
                        icon_color=ft.Colors.WHITE,
                        tooltip="Light / dark",
                        on_click=self._toggle_theme,
                    ),
                ],
                spacing=14,
            ),
            bgcolor=ACCENT,
            padding=20,
        )

        # Stays empty unless the update check finds a newer release.
        self.update_slot = ft.Column(controls=[], spacing=0)

        body = ft.Column(
            controls=[
                self.update_slot,
                self._info_section(),
                self._written_section(),
                self._data_section(),
                self._calc_section(),
                self._analysis_section(),
                self._report_section(),
                ft.Container(height=40),
            ],
            spacing=16,
        )

        self.page.add(
            ft.Column(
                [
                    header,
                    ft.Container(
                        content=body,
                        padding=18,
                        width=MAX_WIDTH,
                        align=ft.Alignment.TOP_CENTER,
                    ),
                ],
                spacing=0,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            )
        )

        # Ask GitHub about newer releases without holding up the window.
        self.page.run_thread(self._check_for_update)

    # -- update check ---------------------------------------------------
    def _check_for_update(self):
        """Runs on a background thread. Fills the slot if there's a newer
        release; does nothing at all if we're current or offline."""
        found = updates.check_for_update()
        if not found:
            return

        def open_download(e):
            self.page.launch_url(found.url)

        def dismiss(e):
            self.update_slot.controls = []
            self.page.update()

        self.update_slot.controls = [
            ft.Container(
                content=ft.Row(
                    [
                        ft.Icon(ft.Icons.NEW_RELEASES, color=ACCENT, size=20),
                        ft.Text(
                            f"Version {found.version} is available — you have v{updates.VERSION}.",
                            size=13,
                            expand=True,
                        ),
                        ft.FilledTonalButton(
                            "Download", icon=ft.Icons.DOWNLOAD, on_click=open_download
                        ),
                        ft.IconButton(
                            icon=ft.Icons.CLOSE, icon_size=16, tooltip="Not now", on_click=dismiss
                        ),
                    ],
                    spacing=10,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
                ),
                padding=ft.Padding(14, 8, 8, 8),
                border_radius=8,
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
                border=ft.Border.all(1, ACCENT),
            )
        ]
        self.page.update()

    # -- 1. lab info ----------------------------------------------------
    def _info_section(self):
        self.f_title = field("Lab title", "Determining the Density of an Unknown Metal")
        self.f_name = field("Your name")
        self.f_course = field("Class / period", "Chemistry, Period 3")
        self.f_teacher = field("Teacher")
        self.f_date = field("Date", "Aug 31, 2026")
        self.f_partners = field("Lab partners", "comma separated")

        def pair(a, b):
            return ft.Row(
                [ft.Container(a, expand=True), ft.Container(b, expand=True)], spacing=12
            )

        return section(
            "1. Lab info",
            ft.Icons.BADGE,
            self.f_title,
            pair(self.f_name, self.f_course),
            pair(self.f_teacher, self.f_date),
            self.f_partners,
        )

    # -- 2. materials + safety ------------------------------------------
    def _written_section(self):
        self.f_materials = field(
            "Material list — one per line",
            "250 mL beaker\ngraduated cylinder\nhot plate",
            multiline=True,
            lines=5,
        )
        self.f_safety = field(
            "Safety precautions — one per line",
            "Wear goggles at all times\nTie back long hair near the hot plate",
            multiline=True,
            lines=5,
        )

        return section(
            "2. Materials & safety",
            ft.Icons.EDIT_NOTE,
            self.f_materials,
            self.f_safety,
            subtitle="One item per line — they become bullet points in the report.",
        )

    # -- 3. data tables -------------------------------------------------
    @staticmethod
    def _blank_table() -> dict:
        return {
            "title": "",
            "headers": ["Trial", "Measurement", "Units"],
            "rows": [["1", "", ""], ["2", "", ""], ["3", "", ""]],
        }

    def _data_section(self):
        self.tables_col = ft.Column(controls=[], spacing=14)
        self._render_tables()
        return section(
            "3. Data tables",
            ft.Icons.TABLE_CHART,
            self.tables_col,
            ft.OutlinedButton(
                "Add table", icon=ft.Icons.ADD_CHART, on_click=self._add_table
            ),
            subtitle="Edit the column names to match your lab. Add more tables if one lab needs several.",
        )

    def _render_tables(self):
        self.tables_col.controls = [
            self._table_card(i) for i in range(len(self.tables))
        ]

    def _table_card(self, t: int) -> ft.Control:
        """One editable table: title, header row, data rows, its own buttons."""
        table = self.tables[t]
        headers, rows = table["headers"], table["rows"]

        def on_title(e):
            table["title"] = e.control.value

        def header_box(i: int):
            def on_change(e):
                headers[i] = e.control.value

            return ft.TextField(
                value=headers[i],
                dense=True,
                text_size=13,
                border_radius=6,
                expand=True,
                on_change=on_change,
            )

        def cell_box(r: int, c: int):
            def on_change(e):
                rows[r][c] = e.control.value

            return ft.TextField(
                value=rows[r][c] if c < len(rows[r]) else "",
                dense=True,
                text_size=13,
                border_radius=6,
                expand=True,
                on_change=on_change,
            )

        def del_row(r: int):
            def handler(e):
                if len(rows) > 1:
                    rows.pop(r)
                    self._render_tables()
                    self.page.update()

            return handler

        def add_row(e):
            rows.append(["" for _ in headers])
            self._render_tables()
            self.page.update()

        def add_col(e):
            headers.append(f"Column {len(headers) + 1}")
            for row in rows:
                row.append("")
            self._render_tables()
            self.page.update()

        def remove_col(e):
            if len(headers) > 1:
                headers.pop()
                for row in rows:
                    if len(row) >= len(headers) + 1:
                        row.pop()
                self._render_tables()
                self.page.update()

        def delete_table(e):
            if len(self.tables) > 1:
                self.tables.pop(t)
                self._render_tables()
                self.page.update()

        title_row = ft.Row(
            [
                ft.TextField(
                    label=f"Table {t + 1} name",
                    hint_text="e.g. Trial masses",
                    value=table["title"],
                    dense=True,
                    border_radius=8,
                    expand=True,
                    on_change=on_title,
                ),
                ft.IconButton(
                    icon=ft.Icons.DELETE_OUTLINE,
                    tooltip="Delete this table",
                    disabled=len(self.tables) == 1,
                    on_click=delete_table,
                ),
            ],
            spacing=6,
        )

        head = ft.Row(
            [*[header_box(i) for i in range(len(headers))], ft.Container(width=40)],
            spacing=6,
        )
        body = []
        for r in range(len(rows)):
            while len(rows[r]) < len(headers):
                rows[r].append("")
            body.append(
                ft.Row(
                    [
                        *[cell_box(r, c) for c in range(len(headers))],
                        ft.IconButton(
                            icon=ft.Icons.CLOSE,
                            icon_size=16,
                            tooltip="Delete row",
                            on_click=del_row(r),
                        ),
                    ],
                    spacing=6,
                )
            )

        buttons = ft.Row(
            [
                ft.OutlinedButton("Add row", icon=ft.Icons.ADD, on_click=add_row),
                ft.OutlinedButton(
                    "Add column", icon=ft.Icons.VIEW_COLUMN, on_click=add_col
                ),
                ft.OutlinedButton(
                    "Remove last column",
                    icon=ft.Icons.REMOVE,
                    disabled=len(headers) == 1,
                    on_click=remove_col,
                ),
            ],
            spacing=10,
            wrap=True,
        )

        return ft.Container(
            content=ft.Column([title_row, head, *body, buttons], spacing=6),
            padding=12,
            border_radius=8,
            border=ft.Border.all(1, ft.Colors.OUTLINE_VARIANT),
        )

    def _add_table(self, e):
        self.tables.append(self._blank_table())
        self._render_tables()
        self.page.update()

    # -- 4. calculations ------------------------------------------------
    def _calc_section(self):
        self.calc_inputs = ft.Column(controls=[], spacing=8)
        self.calc_list = ft.Column(controls=[], spacing=8)
        self.calc_status = ft.Column(controls=[], spacing=8)
        self._input_fields: list[ft.TextField] = []

        first_key = next(iter(chem.CALCULATIONS))
        self.calc_dd = ft.Dropdown(
            label="Calculation",
            options=[
                ft.DropdownOption(key=k, text=v[0])
                for k, v in chem.CALCULATIONS.items()
            ],
            value=first_key,
            on_select=self._calc_changed,
            width=280,
        )
        self.f_unit = ft.TextField(
            label="Unit",
            value=UNIT_HINTS.get(first_key, ""),
            hint_text="g/mL",
            dense=True,
            border_radius=8,
            width=120,
        )
        self.f_value = ft.TextField(
            label="Value",
            hint_text="12.4",
            dense=True,
            border_radius=8,
            width=180,
            on_submit=self._add_value,
        )
        self.value_chips = ft.Row(controls=[], wrap=True, spacing=8)
        self._render_calc_inputs()

        return section(
            "4. Calculations",
            ft.Icons.CALCULATE,
            ft.Row(
                [
                    self.calc_dd,
                    self.f_unit,
                    ft.FilledButton(
                        "Calculate & add",
                        icon=ft.Icons.ADD_TASK,
                        on_click=self._do_calc,
                    ),
                ],
                spacing=12,
                wrap=True,
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            self.calc_inputs,
            self.calc_status,
            ft.Divider(),
            self.calc_list,
            subtitle=(
                "Each one you add shows up in the report with the work written "
                "out. The Unit box prefills — type over it to use your own. "
                "Average takes one number at a time — Add each, then Calculate."
            ),
        )

    def _render_calc_inputs(self):
        key = self.calc_dd.value

        if key in LIST_INPUTS:
            # One number at a time — type it, confirm it, it joins the list.
            self._input_fields = []
            self._render_value_chips()
            self.calc_inputs.controls = [
                ft.Row(
                    [
                        self.f_value,
                        ft.OutlinedButton(
                            "Add value",
                            icon=ft.Icons.ADD,
                            on_click=self._add_value,
                        ),
                    ],
                    spacing=12,
                ),
                self.value_chips,
            ]
            return

        labels = chem.CALCULATIONS[key][1]
        self._input_fields = [
            ft.TextField(label=lbl, dense=True, border_radius=8, width=240)
            for lbl in labels
        ]
        self.calc_inputs.controls = [ft.Row(self._input_fields, spacing=12, wrap=True)]

    def _render_value_chips(self):
        """Show the confirmed numbers, each with an X to take it back off."""

        def drop(i: int):
            def handler(e):
                self.avg_values.pop(i)
                self._render_value_chips()
                self.page.update()

            return handler

        chips = [
            ft.Container(
                content=ft.Row(
                    [
                        ft.Text(f"{v:g}", size=13, weight=ft.FontWeight.BOLD),
                        ft.IconButton(
                            icon=ft.Icons.CLOSE,
                            icon_size=14,
                            tooltip="Remove",
                            on_click=drop(i),
                        ),
                    ],
                    spacing=0,
                    tight=True,
                ),
                padding=ft.Padding(10, 0, 0, 0),
                border_radius=20,
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            )
            for i, v in enumerate(self.avg_values)
        ]

        if chips:
            count = len(self.avg_values)
            chips.append(
                ft.Container(
                    content=ft.Text(
                        f"{count} value{'' if count == 1 else 's'}",
                        size=12,
                        color=ft.Colors.ON_SURFACE_VARIANT,
                    ),
                    padding=ft.Padding(6, 10, 6, 0),
                )
            )
        else:
            chips = [
                ft.Text(
                    "No values yet — type one and hit Add (or press Enter).",
                    size=12,
                    color=ft.Colors.ON_SURFACE_VARIANT,
                )
            ]

        self.value_chips.controls = chips

    def _add_value(self, e):
        """Confirm one number into the list."""
        raw = (self.f_value.value or "").strip()
        if not raw:
            return
        try:
            self.avg_values.append(float(raw))
        except ValueError:
            self._show(self.calc_status, banner(f"{raw!r} isn't a number.", "error"))
            return

        self.f_value.value = ""
        self.calc_status.controls = []
        self._render_value_chips()
        self.page.update()

    def _calc_changed(self, e):
        self.avg_values = []
        self.f_value.value = ""
        self._render_calc_inputs()
        self.f_unit.value = UNIT_HINTS.get(self.calc_dd.value, "")
        self.calc_status.controls = []
        self.page.update()

    def _do_calc(self, e):
        key = self.calc_dd.value
        name, labels, fn = chem.CALCULATIONS[key]

        if key in LIST_INPUTS:
            if not self.avg_values:
                self._show(
                    self.calc_status,
                    banner("Add at least one value first.", "error"),
                )
                return
            args = [list(self.avg_values)]
        else:
            try:
                args = [float(f.value.strip()) for f in self._input_fields]
            except (ValueError, AttributeError):
                self._show(
                    self.calc_status, banner("Every box needs a number.", "error")
                )
                return

        try:
            result = fn(*args)
        except NotBuiltYet as nb:
            self._show(self.calc_status, banner(f"Not built yet — {nb.step}", "todo"))
            return
        except Exception as ex:
            self._show(self.calc_status, banner(str(ex), "error"))
            return

        if not isinstance(result, CalcResult):
            self._show(
                self.calc_status,
                banner(
                    f"{name} returned a {type(result).__name__}, not a CalcResult. "
                    "Calculate into a variable, then return CalcResult(...) — "
                    "see percent_error in chem.py.",
                    "error",
                ),
            )
            return

        chosen = (self.f_unit.value or "").strip()
        if chosen != result.unit:
            result.work = _swap_unit(result.work, result.unit, chosen)
            result.unit = chosen

        self.calc_results.append(result)
        if key in LIST_INPUTS:
            self.avg_values = []
            self._render_value_chips()
        self._render_calc_list()
        self.calc_status.controls = []
        self.page.update()

    def _render_calc_list(self):
        def remove(i):
            def handler(e):
                self.calc_results.pop(i)
                self._render_calc_list()
                self.page.update()

            return handler

        self.calc_list.controls = [
            ft.Container(
                content=ft.Row(
                    [
                        ft.Column(
                            [
                                ft.Text(
                                    f"{c.name} = {c.pretty()}",
                                    weight=ft.FontWeight.BOLD,
                                ),
                                ft.Text(
                                    c.work or c.formula,
                                    size=11,
                                    color=ft.Colors.ON_SURFACE_VARIANT,
                                ),
                            ],
                            spacing=2,
                            expand=True,
                        ),
                        ft.IconButton(
                            icon=ft.Icons.DELETE_OUTLINE,
                            icon_size=18,
                            on_click=remove(i),
                        ),
                    ]
                ),
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
                padding=12,
                border_radius=8,
            )
            for i, c in enumerate(self.calc_results)
        ]

    # -- 5. analysis questions ------------------------------------------
    def _analysis_section(self):
        self.analysis_col = ft.Column(controls=[], spacing=10)
        self._render_analysis()
        return section(
            "5. Analysis questions",
            ft.Icons.QUIZ,
            self.analysis_col,
            ft.OutlinedButton(
                "Add question", icon=ft.Icons.ADD, on_click=self._add_question
            ),
            subtitle="The questions off your lab sheet, plus your answers.",
        )

    def _render_analysis(self):
        def q_box(i: int):
            def on_change(e):
                self.analysis[i][0] = e.control.value

            return ft.TextField(
                value=self.analysis[i][0],
                label=f"Question {i + 1}",
                dense=True,
                text_size=13,
                border_radius=8,
                multiline=True,
                min_lines=1,
                max_lines=3,
                expand=2,
                on_change=on_change,
            )

        def a_box(i: int):
            def on_change(e):
                self.analysis[i][1] = e.control.value

            return ft.TextField(
                value=self.analysis[i][1],
                label="Your answer",
                dense=True,
                text_size=13,
                border_radius=8,
                multiline=True,
                min_lines=1,
                max_lines=6,
                expand=3,
                on_change=on_change,
            )

        def del_question(i: int):
            def handler(e):
                if len(self.analysis) > 1:
                    self.analysis.pop(i)
                    self._render_analysis()
                    self.page.update()

            return handler

        self.analysis_col.controls = [
            ft.Row(
                [
                    q_box(i),
                    a_box(i),
                    ft.IconButton(
                        icon=ft.Icons.CLOSE,
                        icon_size=16,
                        tooltip="Delete question",
                        on_click=del_question(i),
                    ),
                ],
                spacing=8,
                vertical_alignment=ft.CrossAxisAlignment.START,
            )
            for i in range(len(self.analysis))
        ]

    def _add_question(self, e):
        self.analysis.append(["", ""])
        self._render_analysis()
        self.page.update()

    # -- 6. report ------------------------------------------------------
    def _report_section(self):
        self.report_status = ft.Column(controls=[], spacing=8)
        self.preview = ft.Markdown(value="", selectable=True)
        self.docx_btn = ft.FilledTonalButton(
            "Save as Word",
            icon=ft.Icons.DESCRIPTION,
            disabled=True,
            on_click=self._save_docx,
        )
        self.save_btn = ft.OutlinedButton(
            "Save as .md", icon=ft.Icons.DOWNLOAD, disabled=True, on_click=self._save
        )
        self._report_text = ""

        # Word options — theme + a few toggles. The theme list comes straight
        # from export_docx.THEMES, so adding one there adds it here.
        self.theme_dd = ft.Dropdown(
            label="Word theme",
            options=[ft.DropdownOption(key=n, text=n) for n in export_docx.theme_names()],
            value=export_docx.DEFAULT_THEME,
            width=220,
        )
        self.opt_formulas = ft.Checkbox(label="Show formulas", value=True)
        self.opt_stripes = ft.Checkbox(label="Striped data rows", value=True)
        self.opt_unanswered = ft.Checkbox(label="Flag unanswered questions", value=True)
        word_options = ft.Container(
            content=ft.Column(
                [
                    ft.Text(
                        "Word export options",
                        size=12,
                        weight=ft.FontWeight.BOLD,
                        color=ft.Colors.ON_SURFACE_VARIANT,
                    ),
                    ft.Row(
                        [
                            self.theme_dd,
                            self.opt_formulas,
                            self.opt_stripes,
                            self.opt_unanswered,
                        ],
                        spacing=14,
                        wrap=True,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                ],
                spacing=6,
            ),
            padding=12,
            border_radius=8,
            bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
        )

        return section(
            "6. Your report",
            ft.Icons.DESCRIPTION,
            ft.Row(
                [
                    ft.FilledButton(
                        "Generate report",
                        icon=ft.Icons.PLAY_ARROW,
                        on_click=self._generate,
                    ),
                    self.docx_btn,
                    self.save_btn,
                ],
                spacing=10,
                wrap=True,
            ),
            word_options,
            self.report_status,
            ft.Container(
                content=self.preview,
                padding=14,
                border_radius=8,
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            ),
        )

    def _collect(self) -> LabReport:
        return LabReport(
            info=LabInfo(
                title=self.f_title.value or "",
                student_name=self.f_name.value or "",
                course=self.f_course.value or "",
                teacher=self.f_teacher.value or "",
                date=self.f_date.value or "",
                partners=self.f_partners.value or "",
            ),
            content=LabContent(
                materials=self.f_materials.value or "",
                safety=self.f_safety.value or "",
            ),
            tables=[
                DataTable(
                    title=(tb["title"] or "").strip(),
                    headers=list(tb["headers"]),
                    rows=[list(r) for r in tb["rows"]],
                )
                for tb in self.tables
            ],
            calculations=list(self.calc_results),
            analysis=[
                AnalysisQuestion(question=q, answer=a)
                for q, a in self.analysis
                if q.strip() or a.strip()
            ],
        )

    def _generate(self, e):
        try:
            text = report_mod.build_report(self._collect())
        except NotBuiltYet as nb:
            self._show(self.report_status, banner(f"Not built yet — {nb.step}", "todo"))
            return
        except Exception as ex:
            self._show(
                self.report_status, banner(f"{type(ex).__name__}: {ex}", "error")
            )
            return

        self._report_text = text or ""
        self.preview.value = self._report_text
        self.save_btn.disabled = not self._report_text
        self.docx_btn.disabled = not self._report_text
        self.report_status.controls = []
        self.page.update()

    async def _save_docx(self, e):
        """Build a .docx from the same form data and let the user save it."""
        try:
            options = export_docx.DocxOptions(
                theme=self.theme_dd.value or export_docx.DEFAULT_THEME,
                show_formulas=bool(self.opt_formulas.value),
                striped_rows=bool(self.opt_stripes.value),
                mark_unanswered=bool(self.opt_unanswered.value),
            )
            blob = export_docx.build_docx(self._collect(), options)
        except export_docx.DocxNotInstalled as missing:
            self._show(self.report_status, banner(str(missing), "todo"))
            return
        except Exception as ex:
            self._show(
                self.report_status, banner(f"{type(ex).__name__}: {ex}", "error")
            )
            return

        title = (self.f_title.value or "").strip() or "lab report"
        safe = "".join(c if (c.isalnum() or c in " -_") else "" for c in title).strip()
        await self.picker.save_file(
            dialog_title="Save your lab report",
            file_name=f"{safe or 'lab report'}.docx",
            src_bytes=blob,
        )
        self.report_status.controls = []
        self.toast("Saved as Word.")

    async def _save(self, e):
        if not self._report_text:
            return
        await self.picker.save_file(
            dialog_title="Save your lab report",
            file_name="lab_report.md",
            src_bytes=self._report_text.encode("utf-8"),
        )
        self.toast("Saved.")

    # -- tiny helper ------------------------------------------------------
    def _show(self, holder: ft.Column, control):
        holder.controls = [control]
        self.page.update()
