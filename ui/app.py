"""
The whole user interface — every screen, button and box.

It never reaches into the backend's logic. It only calls:
    backend.chem.CALCULATIONS        -> builds the calculation dropdown
    backend.report.build_report(...) -> the Generate button
    backend.export_docx.build_docx() -> the Save as Word button

A backend function that still raises NotBuiltYet shows an amber
"not built yet" strip instead of crashing the app.
"""

from __future__ import annotations

import re

import flet as ft

from backend import calculator, chem, export_docx, report as report_mod, updates
from backend.models import (
    AnalysisQuestion,
    CalcResult,
    sci_text,
    to_scientific,
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

        report_body = ft.Column(
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

        tabs = ft.Tabs(
            length=2,
            expand=True,
            on_change=self._tab_changed,
            content=ft.Column(
                [
                    ft.TabBar(
                        tabs=[
                            ft.Tab(label="Lab report", icon=ft.Icons.DESCRIPTION),
                            ft.Tab(label="Trigonometry", icon=ft.Icons.CALCULATE),
                        ]
                    ),
                    ft.TabBarView(
                        controls=[
                            self._tab_page(report_body),
                            self._tab_page(self._calculator_body()),
                        ],
                        expand=True,
                    ),
                ],
                spacing=0,
                expand=True,
            ),
        )

        self.page.add(ft.Column([header, tabs], spacing=0, expand=True))

        # A pocket calculator that floats over whichever tab you're on.
        self.mini_open = False
        self.mini_text = ""
        self.mini_answer = ""
        self.mini_just_solved = False
        self.mini_box = ft.Container(
            # Top-left of the content area. top=145 clears the app header and
            # the tab bar — at top=20 a teal circle sits invisibly on the
            # teal header.
            left=20,
            top=145,
            animate=200,
            animate_opacity=200,
            visible=False,  # Trigonometry tab only; _tab_changed shows it
        )
        self._render_mini()
        self.page.overlay.append(self.mini_box)

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

    def _tab_page(self, body: ft.Control) -> ft.Control:
        """One tab's scrolling, width-limited page."""
        return ft.Column(
            [ft.Container(content=body, padding=18, width=MAX_WIDTH)],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            scroll=ft.ScrollMode.AUTO,
            expand=True,
        )

    def _tab_changed(self, e):
        """The floating keypad belongs to the Trigonometry tab, not the form."""
        index = getattr(e.control, "selected_index", 0) or 0
        on_trig_tab = index == 1
        self.mini_box.visible = on_trig_tab
        if not on_trig_tab and self.mini_open:
            # collapse it so it isn't mid-expansion when you come back
            self.mini_open = False
            self._render_mini()
        self.page.update()

    # -- floating pocket calculator ---------------------------------------
    # Collapsed it's a button in the corner; clicking it grows into a keypad.
    # The keys just build up a string, which the same safe evaluator behind
    # the Calculator tab works out — no second maths engine to keep right.

    _MINI_KEYS = [
        ["C", "\u232b", "(", ")"],
        ["\u221a", "x\u00b2", "^", "a/b"],
        ["7", "8", "9", "\u00f7"],
        ["4", "5", "6", "\u00d7"],
        ["1", "2", "3", "-"],
        ["0", ".", "=", "+"],
    ]
    # What a key types, when that differs from what it says.
    _MINI_INSERTS = {"x\u00b2": "^2", "a/b": "/"}
    _MINI_OPERATORS = {"\u00f7", "\u00d7", "-", "+", "^", "/"}

    def _toggle_mini(self, e=None):
        self.mini_open = not self.mini_open
        self._render_mini()
        self.page.update()

    def _mini_key(self, key: str):
        """One keypad press."""

        def handler(e):
            if key == "C":
                self.mini_text = ""
                self.mini_answer = ""
            elif key == "\u232b":
                self.mini_text = self.mini_text[:-1]
            elif key == "=":
                if self.mini_text.strip():
                    try:
                        value = calculator.evaluate(self.mini_text, degrees=True)
                        self.mini_answer = calculator.format_answer(value)
                    except calculator.CalcError as bad:
                        self.mini_answer = str(bad)
                    except Exception:
                        self.mini_answer = "That didn't work."
                    self.mini_just_solved = True
            else:
                # After an answer, a digit starts fresh but an operator
                # carries on from the answer — what a calculator normally does.
                if self.mini_just_solved:
                    starts_over = key not in self._MINI_OPERATORS
                    self.mini_text = "" if starts_over else self.mini_answer
                    if starts_over:
                        self.mini_answer = ""
                    self.mini_just_solved = False
                self.mini_text += self._MINI_INSERTS.get(key, key)

            if key != "=":
                self.mini_just_solved = False
            self._render_mini()
            self.page.update()

        return handler

    def _mini_button(self, key: str) -> ft.Control:
        if key == "=":
            bg, fg = ACCENT, ft.Colors.WHITE
        elif key in self._MINI_OPERATORS or key in (
            "C",
            "\u232b",
            "(",
            ")",
            "\u221a",
            "x\u00b2",
        ):
            bg, fg = ft.Colors.SURFACE_CONTAINER_HIGH, ACCENT
        else:
            bg, fg = ft.Colors.SURFACE_CONTAINER_HIGHEST, ft.Colors.ON_SURFACE
        return ft.Container(
            content=ft.Text(key, size=15, weight=ft.FontWeight.BOLD, color=fg),
            width=48,
            height=38,
            bgcolor=bg,
            border_radius=8,
            alignment=ft.Alignment.CENTER,
            ink=True,
            on_click=self._mini_key(key),
        )

    def _render_mini(self):
        if not self.mini_open:
            self.mini_box.width = 56
            self.mini_box.height = 56
            self.mini_box.bgcolor = ACCENT
            self.mini_box.border_radius = 28
            self.mini_box.padding = 0
            self.mini_box.border = None
            self.mini_box.shadow = ft.BoxShadow(
                blur_radius=10, color=ft.Colors.with_opacity(0.3, ft.Colors.BLACK)
            )
            self.mini_box.content = ft.Container(
                content=ft.Icon(ft.Icons.CALCULATE, color=ft.Colors.WHITE, size=26),
                alignment=ft.Alignment.CENTER,
                ink=True,
                border_radius=28,
                on_click=self._toggle_mini,
                tooltip="Quick calculator",
            )
            return

        self.mini_box.width = 248
        self.mini_box.height = 400
        self.mini_box.bgcolor = ft.Colors.SURFACE_CONTAINER_LOW
        self.mini_box.border_radius = 14
        self.mini_box.padding = 12
        self.mini_box.border = ft.Border.all(1, ft.Colors.OUTLINE_VARIANT)
        self.mini_box.shadow = ft.BoxShadow(
            blur_radius=16, color=ft.Colors.with_opacity(0.35, ft.Colors.BLACK)
        )
        self.mini_box.content = ft.Column(
            [
                ft.Row(
                    [
                        ft.Text(
                            "Quick calculator",
                            size=12,
                            weight=ft.FontWeight.BOLD,
                            color=ft.Colors.ON_SURFACE_VARIANT,
                            expand=True,
                        ),
                        ft.Container(
                            content=ft.Icon(
                                ft.Icons.CLOSE,
                                size=15,
                                color=ft.Colors.ON_SURFACE_VARIANT,
                            ),
                            width=22,
                            height=22,
                            border_radius=11,
                            alignment=ft.Alignment.CENTER,
                            ink=True,
                            tooltip="Close",
                            on_click=self._toggle_mini,
                        ),
                    ],
                    spacing=0,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
                ),
                ft.Container(
                    content=ft.Column(
                        [
                            ft.Text(
                                self.mini_text or " ",
                                size=11,
                                color=ft.Colors.ON_SURFACE_VARIANT,
                                text_align=ft.TextAlign.RIGHT,
                                max_lines=1,
                            ),
                            ft.Text(
                                self.mini_answer or " ",
                                size=17,
                                weight=ft.FontWeight.BOLD,
                                text_align=ft.TextAlign.RIGHT,
                                max_lines=2,
                                selectable=True,
                            ),
                        ],
                        spacing=0,
                        horizontal_alignment=ft.CrossAxisAlignment.END,
                    ),
                    padding=ft.Padding(8, 4, 8, 4),
                    border_radius=8,
                    bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
                ),
                ft.Column(
                    [
                        ft.Row(
                            [self._mini_button(k) for k in row],
                            spacing=5,
                        )
                        for row in self._MINI_KEYS
                    ],
                    spacing=5,
                ),
            ],
            spacing=4,
        )

    # -- calculator tab ---------------------------------------------------
    # Every function you can use, as a button. Tapping beats typing "asin("
    # and getting it subtly wrong. A button that opens a bracket doesn't
    # bother closing it — close_brackets() in the engine does that for you.
    _PALETTE = [
        (
            "Trigonometry",
            [
                ("sin", "sin("),
                ("cos", "cos("),
                ("tan", "tan("),
                ("asin", "asin("),
                ("acos", "acos("),
                ("atan", "atan("),
            ],
        ),
        (
            "Logs & powers",
            [
                ("log", "log("),
                ("ln", "ln("),
                ("log\u2082", "log2("),
                ("e\u02e3", "exp("),
                ("\u221a", "\u221a"),
                ("x\u00b2", "^2"),
                ("x\u02b8", "^"),
            ],
        ),
        (
            "Numbers & brackets",
            [
                ("\u03c0", "pi"),
                ("e", "e"),
                ("(", "("),
                (")", ")"),
                ("\u00b0", "\u00b0"),
                ("ans", "ans"),
                ("|x|", "abs("),
                ("round", "round("),
                ("n!", "factorial("),
            ],
        ),
    ]

    def _palette_insert(self, text: str):
        def handler(e):
            self.calc_expr.value = (self.calc_expr.value or "") + text
            self.page.update()

        return handler

    def _palette_backspace(self, e):
        self.calc_expr.value = (self.calc_expr.value or "")[:-1]
        self.page.update()

    def _palette_clear(self, e):
        self.calc_expr.value = ""
        self.calc_answer.value = "\u2014"
        self.calc_sci.value = ""
        self.calc_error.controls = []
        self.page.update()

    def _palette_button(self, label: str, insert: str) -> ft.Control:
        return ft.Container(
            content=ft.Text(
                label, size=13, weight=ft.FontWeight.BOLD, color=ACCENT
            ),
            height=36,
            padding=ft.Padding(12, 0, 12, 0),
            bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            border_radius=8,
            alignment=ft.Alignment.CENTER,
            ink=True,
            tooltip=f"types  {insert}",
            on_click=self._palette_insert(insert),
        )

    def _var_chip(self, name: str, value: float) -> ft.Control:
        shown = calculator.format_answer(value)
        just_replaced = name == getattr(self, "_replaced", None)
        return ft.Container(
            content=ft.Row(
                [
                    ft.Text(name, size=13, weight=ft.FontWeight.BOLD, color=ACCENT),
                    ft.Text("=", size=12, color=ft.Colors.ON_SURFACE_VARIANT),
                    ft.Text(shown, size=13),
                ],
                spacing=6,
                tight=True,
            ),
            height=34,
            padding=ft.Padding(12, 0, 12, 0),
            bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            border_radius=17,
            border=ft.Border.all(1, ACCENT) if just_replaced else None,
            alignment=ft.Alignment.CENTER,
            ink=True,
            tooltip=(
                f"just replaced \u2014 types  {name}"
                if just_replaced
                else f"types  {name}"
            ),
            on_click=self._palette_insert(name),
        )

    def _render_vars(self):
        chips = []
        if "ans" in self.calc_vars:
            chips.append(self._var_chip("ans", self.calc_vars["ans"]))
        chips += [
            self._var_chip(name, value)
            for name, value in sorted(self.calc_vars.items())
            if name != "ans"
        ]
        if not chips:
            chips = [
                ft.Text(
                    "Nothing stored yet \u2014 type  x = 5  and press Solve.",
                    size=12,
                    color=ft.Colors.ON_SURFACE_VARIANT,
                )
            ]
        self.calc_vars_row.controls = chips

    def _clear_vars(self, e):
        self.calc_vars = {}
        self._replaced = None
        self._render_vars()
        self.page.update()

    def _palette(self) -> ft.Control:
        rows = []
        for caption, buttons in self._PALETTE:
            rows.append(
                ft.Text(
                    caption,
                    size=11,
                    weight=ft.FontWeight.BOLD,
                    color=ft.Colors.ON_SURFACE_VARIANT,
                )
            )
            rows.append(
                ft.Row(
                    [self._palette_button(lbl, ins) for lbl, ins in buttons],
                    spacing=6,
                    wrap=True,
                )
            )
        rows.append(
            ft.Row(
                [
                    ft.OutlinedButton(
                        "Backspace",
                        icon=ft.Icons.BACKSPACE_OUTLINED,
                        on_click=self._palette_backspace,
                    ),
                    ft.OutlinedButton(
                        "Clear",
                        icon=ft.Icons.CLEAR,
                        on_click=self._palette_clear,
                    ),
                ],
                spacing=10,
                wrap=True,
            )
        )
        return ft.Column(rows, spacing=6)

    def _calculator_body(self) -> ft.Control:
        """A scratch scientific calculator. Nothing here touches the report."""
        self.calc_expr = ft.TextField(
            label="Expression",
            hint_text="sin(30) + log(100)",
            autofocus=False,
            dense=True,
            border_radius=8,
            expand=True,
            on_submit=self._solve,
        )
        self.calc_degrees = ft.Switch(label="Degrees", value=True)
        self.calc_answer = ft.Text(
            "\u2014",
            size=30,
            weight=ft.FontWeight.BOLD,
            text_align=ft.TextAlign.RIGHT,
            max_lines=2,
            selectable=True,
        )
        self.calc_sci = ft.Text(
            "",
            size=13,
            color=ft.Colors.ON_SURFACE_VARIANT,
            text_align=ft.TextAlign.RIGHT,
            max_lines=1,
        )
        self.calc_error = ft.Column(controls=[], spacing=8)
        self.calc_history = ft.Column(controls=[], spacing=2)
        self._history: list[tuple[str, str]] = []
        # Names you've stored, plus "ans" for the last answer.
        self.calc_vars: dict[str, float] = {}
        self._replaced: str | None = None
        self.calc_vars_row = ft.Row(controls=[], spacing=8, wrap=True)
        self._render_vars()

        # Fixed height so the panel doesn't jump around as answers come and
        # go, and everything right-aligned the way a calculator reads.
        answer_box = ft.Container(
            content=ft.Row(
                [
                    ft.Text(
                        "=",
                        size=22,
                        weight=ft.FontWeight.BOLD,
                        color=ft.Colors.ON_SURFACE_VARIANT,
                    ),
                    ft.Column(
                        [self.calc_answer, self.calc_sci],
                        spacing=0,
                        expand=True,
                        alignment=ft.MainAxisAlignment.CENTER,
                        horizontal_alignment=ft.CrossAxisAlignment.END,
                    ),
                ],
                spacing=14,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            height=104,
            padding=ft.Padding(18, 12, 18, 12),
            border_radius=10,
            bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            border=ft.Border.all(1, ft.Colors.OUTLINE_VARIANT),
        )

        reference = ft.Text(
            "Functions: " + ", ".join(calculator.function_names()) + "\n"
            "Constants: pi, e, tau.  Powers: 2^10 or 2**10.  "
            "Roots: \u221a81 or sqrt(81) \u2014 brackets optional on a plain number.  "
            "Closing brackets are added for you if you forget them.  "
            "Fractions are just division: 3/4, 2/3 - 1/6.  "
            "Degrees: sin(30\u00b0) is 0.5 whichever way the switch is set.  "
            "Variables: x = 5 stores it, ans is your last answer.  "
            "You can also type \u00d7 \u00f7 \u221a \u03c0 and superscripts like 10\u00b2\u00b3.",
            size=11,
            color=ft.Colors.ON_SURFACE_VARIANT,
            selectable=True,
        )

        return ft.Column(
            [
                section(
                    "Trigonometry & scientific maths",
                    ft.Icons.CALCULATE,
                    ft.Row(
                        [
                            self.calc_expr,
                            ft.FilledButton(
                                "Solve", icon=ft.Icons.PLAY_ARROW, on_click=self._solve
                            ),
                        ],
                        spacing=12,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    ft.Row(
                        [
                            self.calc_degrees,
                            ft.Text(
                                "switch off for radians",
                                size=12,
                                color=ft.Colors.ON_SURFACE_VARIANT,
                            ),
                        ],
                        spacing=10,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    self.calc_error,
                    answer_box,
                    ft.Divider(),
                    self._palette(),
                    reference,
                    subtitle="Trigonometry, logs, roots and powers. Separate from your report — nothing here gets saved into it.",
                ),
                section(
                    "Stored values",
                    ft.Icons.DATA_ARRAY,
                    self.calc_vars_row,
                    ft.OutlinedButton(
                        "Clear stored values",
                        icon=ft.Icons.DELETE_OUTLINE,
                        on_click=self._clear_vars,
                    ),
                    subtitle="Type  x = 5  to store one. Click a chip to use it.",
                ),
                section(
                    "History",
                    ft.Icons.HISTORY,
                    self.calc_history,
                    ft.OutlinedButton(
                        "Clear history",
                        icon=ft.Icons.DELETE_OUTLINE,
                        on_click=self._clear_history,
                    ),
                    subtitle="Click any line to put it back in the box.",
                ),
                ft.Container(height=40),
            ],
            spacing=16,
        )

    def _solve(self, e):
        expression = self.calc_expr.value or ""
        try:
            value, assigned = calculator.evaluate_line(
                expression,
                degrees=bool(self.calc_degrees.value),
                variables=self.calc_vars,
            )
        except calculator.CalcError as bad:
            self.calc_answer.value = "\u2014"
            self.calc_sci.value = ""
            self._show(self.calc_error, banner(str(bad), "error"))
            return
        except Exception as ex:  # nothing should reach here, but never crash
            self.calc_answer.value = "\u2014"
            self.calc_sci.value = ""
            self._show(self.calc_error, banner(f"{type(ex).__name__}: {ex}", "error"))
            return

        answer = calculator.format_answer(value)
        self.calc_answer.value = answer
        # a second line in scientific notation, but only when it helps
        big_or_small = value != 0 and (abs(value) >= 1e5 or abs(value) < 1e-3)
        self.calc_sci.value = to_scientific(value, 6) if big_or_small else ""

        if assigned:
            # A name you've already used isn't an error — but it shouldn't
            # change under you silently either, so say so.
            replaced = self.calc_vars.get(assigned)
            self.calc_vars[assigned] = value
            self._replaced = assigned if replaced is not None else None
            if replaced is not None:
                was = calculator.format_answer(replaced)
                note, kind = (
                    f"Replaced {assigned}: {was} \u2192 {answer}",
                    "todo",
                )
            else:
                note, kind = f"Stored {assigned} = {answer}", "ok"
            self.calc_error.controls = [banner(note, kind)]
        else:
            self.calc_error.controls = []
        self.calc_vars["ans"] = value
        self._render_vars()

        self._history.insert(0, (expression.strip(), answer))
        del self._history[12:]
        self._render_history()
        self.page.update()

    def _render_history(self):
        def reuse(expression: str):
            def handler(e):
                self.calc_expr.value = expression
                self.page.update()

            return handler

        if not self._history:
            self.calc_history.controls = [
                ft.Text(
                    "Nothing worked out yet.",
                    size=12,
                    color=ft.Colors.ON_SURFACE_VARIANT,
                )
            ]
            return

        self.calc_history.controls = [
            ft.TextButton(
                content=ft.Text(f"{expression}  =  {answer}", size=13),
                on_click=reuse(expression),
            )
            for expression, answer in self._history
        ]

    def _clear_history(self, e):
        self._history = []
        self._render_history()
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
        self.opt_sci = ft.Checkbox(label="Scientific notation", value=False)
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
                    ft.Container(
                        content=self.opt_sci, padding=ft.Padding(0, 8, 0, 0)
                    ),
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
                "Tick Scientific notation for answers like 6.022 \u00d7 10\u00b2\u00b3. "
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

        # Scientific notation applies at add-time, like the unit override.
        # The work string gets rewritten too, so the shown work reads the
        # same way as the answer above it.
        if self.opt_sci.value:
            result.sci = True
            result.work = sci_text(result.work)

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
