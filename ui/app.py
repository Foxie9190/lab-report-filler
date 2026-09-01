"""
The whole user interface. Claude's file.

You shouldn't need to edit this to get the app working — it already calls
every backend function you're going to write. But it's plain Flet, so poke
at it once things run.

How it talks to your backend:
    backend.chem.CALCULATIONS   -> builds the calculation dropdown
    backend.vision.extract_from_images(...)  -> the picture button
    backend.report.build_report(...)         -> the Generate button

If one of your functions still raises NotBuiltYet, the app shows an amber
"this part is yours" strip instead of crashing.
"""

from __future__ import annotations

import flet as ft

from backend import chem, report as report_mod, vision
from backend.models import DataTable, LabContent, LabInfo, LabReport, NotBuiltYet

from .theme import ACCENT, MAX_WIDTH, SEED, banner, field, section


class LabReportApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.picked_images: list[tuple[bytes, str]] = []
        self.headers: list[str] = ["Trial", "Measurement", "Units"]
        self.rows: list[list[str]] = [["1", "", ""], ["2", "", ""], ["3", "", ""]]
        self.calc_results = []

        self._setup_page()
        # FilePicker is a service — it registers itself, but we must keep a
        # reference alive or it gets garbage-collected out of the registry.
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
                                "Chemistry — fill it in, or let a photo do it",
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

        body = ft.Column(
            controls=[
                self._picture_section(),
                self._info_section(),
                self._written_section(),
                self._data_section(),
                self._calc_section(),
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

    # -- 1. picture -------------------------------------------------------
    def _picture_section(self):
        self.thumbs = ft.Row(controls=[], wrap=True, spacing=8)
        self.pic_status = ft.Column(controls=[], spacing=8)

        has_key = vision.api_key_present()

        self.read_btn = ft.FilledButton(
            "Read with AI",
            icon=ft.Icons.AUTO_AWESOME,
            disabled=True,
            on_click=self._read_images,
        )

        controls = [
            ft.Row(
                [
                    ft.OutlinedButton(
                        "Choose picture(s)",
                        icon=ft.Icons.ADD_PHOTO_ALTERNATE,
                        on_click=self._pick_images,
                    ),
                    self.read_btn,
                ],
                spacing=10,
            ),
            self.thumbs,
            self.pic_status,
        ]

        if not has_key:
            controls.insert(
                0,
                banner(
                    "No ANTHROPIC_API_KEY found, so the AI part is off. Everything "
                    "else works — just type your info in below. (See README to turn "
                    "this on.)",
                    "todo",
                ),
            )

        return section(
            "1. Start from a picture",
            ft.Icons.PHOTO_CAMERA,
            *controls,
            subtitle="Optional. Snap your data table or the lab handout and let it fill the form.",
        )

    async def _pick_images(self, e):
        files = await self.picker.pick_files(
            dialog_title="Pick your lab photo(s)",
            file_type=ft.FilePickerFileType.IMAGE,
            allow_multiple=True,
            with_data=True,
        )
        if not files:
            return

        self.picked_images = [(f.bytes, f.name) for f in files if f.bytes]
        self.thumbs.controls = [
            ft.Container(
                content=ft.Column(
                    [
                        ft.Icon(ft.Icons.IMAGE, color=ACCENT),
                        ft.Text(f.name, size=10, width=90, max_lines=2),
                    ],
                    spacing=4,
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                ),
                padding=8,
                border_radius=8,
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
            )
            for f in files
        ]
        self.read_btn.disabled = not (self.picked_images and vision.api_key_present())
        self.pic_status.controls = []
        self.page.update()

    def _read_images(self, e):
        self.pic_status.controls = [
            ft.Row([ft.ProgressRing(width=16, height=16), ft.Text("Reading…")], spacing=10)
        ]
        self.page.update()
        try:
            data = vision.extract_from_images(self.picked_images)
        except NotBuiltYet as nb:
            self._show(self.pic_status, banner(f"Not built yet — {nb.step}", "todo"))
            return
        except Exception as ex:
            self._show(self.pic_status, banner(f"{type(ex).__name__}: {ex}", "error"))
            return

        self._apply_extracted(data or {})
        self._show(self.pic_status, banner("Filled in from your picture. Check it!", "ok"))

    def _apply_extracted(self, data: dict):
        """Drop whatever the AI found into the matching boxes."""
        mapping = {
            "title": self.f_title,
            "purpose": self.f_purpose,
            "hypothesis": self.f_hypothesis,
            "materials": self.f_materials,
            "procedure": self.f_procedure,
            "observations": self.f_observations,
        }
        for key, control in mapping.items():
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                control.value = val

        headers = data.get("data_headers")
        rows = data.get("data_rows")
        if isinstance(headers, list) and headers:
            self.headers = [str(h) for h in headers]
            self.rows = (
                [[str(c) for c in r] for r in rows]
                if isinstance(rows, list) and rows
                else [["" for _ in self.headers]]
            )
            self._render_table()
        self.page.update()

    # -- 2. lab info ------------------------------------------------------
    def _info_section(self):
        self.f_title = field("Lab title", "Determining the Density of an Unknown Metal")
        self.f_name = field("Your name")
        self.f_course = field("Class / period", "Chemistry, Period 3")
        self.f_teacher = field("Teacher")
        self.f_date = field("Date", "Aug 31, 2026")
        self.f_partners = field("Lab partners", "comma separated")

        def pair(a, b):
            return ft.Row([ft.Container(a, expand=True), ft.Container(b, expand=True)], spacing=12)

        return section(
            "2. Lab info",
            ft.Icons.BADGE,
            self.f_title,
            pair(self.f_name, self.f_course),
            pair(self.f_teacher, self.f_date),
            self.f_partners,
        )

    # -- 3. written sections ----------------------------------------------
    def _written_section(self):
        self.f_purpose = field("Purpose / objective", multiline=True, lines=2)
        self.f_hypothesis = field("Hypothesis", "If… then… because…", multiline=True, lines=2)
        self.f_materials = field("Materials — one per line", multiline=True, lines=4)
        self.f_procedure = field("Procedure — one step per line", multiline=True, lines=4)
        self.f_observations = field("Observations", multiline=True, lines=3)
        self.f_conclusion = field("Conclusion", multiline=True, lines=4)

        return section(
            "3. The written parts",
            ft.Icons.EDIT_NOTE,
            self.f_purpose,
            self.f_hypothesis,
            self.f_materials,
            self.f_procedure,
            self.f_observations,
            self.f_conclusion,
        )

    # -- 4. data table ----------------------------------------------------
    def _data_section(self):
        self.table_col = ft.Column(controls=[], spacing=6)
        self._render_table()
        return section(
            "4. Data table",
            ft.Icons.TABLE_CHART,
            self.table_col,
            ft.Row(
                [
                    ft.OutlinedButton("Add row", icon=ft.Icons.ADD, on_click=self._add_row),
                    ft.OutlinedButton("Add column", icon=ft.Icons.VIEW_COLUMN, on_click=self._add_col),
                ],
                spacing=10,
            ),
            subtitle="Edit the column names to match your lab.",
        )

    def _render_table(self):
        def header_box(i: int):
            def on_change(e):
                self.headers[i] = e.control.value

            return ft.TextField(
                value=self.headers[i],
                dense=True,
                text_size=13,
                border_radius=6,
                expand=True,
                on_change=on_change,
            )

        def cell_box(r: int, c: int):
            def on_change(e):
                self.rows[r][c] = e.control.value

            return ft.TextField(
                value=self.rows[r][c] if c < len(self.rows[r]) else "",
                dense=True,
                text_size=13,
                border_radius=6,
                expand=True,
                on_change=on_change,
            )

        def del_row(r: int):
            def handler(e):
                if len(self.rows) > 1:
                    self.rows.pop(r)
                    self._render_table()
                    self.page.update()

            return handler

        head = ft.Row(
            [*[header_box(i) for i in range(len(self.headers))], ft.Container(width=40)],
            spacing=6,
        )
        body = []
        for r in range(len(self.rows)):
            while len(self.rows[r]) < len(self.headers):
                self.rows[r].append("")
            body.append(
                ft.Row(
                    [
                        *[cell_box(r, c) for c in range(len(self.headers))],
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
        self.table_col.controls = [head, *body]

    def _add_row(self, e):
        self.rows.append(["" for _ in self.headers])
        self._render_table()
        self.page.update()

    def _add_col(self, e):
        self.headers.append(f"Column {len(self.headers) + 1}")
        for r in self.rows:
            r.append("")
        self._render_table()
        self.page.update()

    # -- 5. calculations --------------------------------------------------
    def _calc_section(self):
        self.calc_inputs = ft.Column(controls=[], spacing=8)
        self.calc_list = ft.Column(controls=[], spacing=8)
        self.calc_status = ft.Column(controls=[], spacing=8)
        self._input_fields: list[ft.TextField] = []

        self.calc_dd = ft.Dropdown(
            label="Calculation",
            options=[
                ft.DropdownOption(key=k, text=v[0]) for k, v in chem.CALCULATIONS.items()
            ],
            value=next(iter(chem.CALCULATIONS)),
            on_select=self._calc_changed,
            width=280,
        )
        self._render_calc_inputs()

        return section(
            "5. Calculations",
            ft.Icons.CALCULATE,
            ft.Row(
                [
                    self.calc_dd,
                    ft.FilledButton("Calculate & add", icon=ft.Icons.ADD_TASK, on_click=self._do_calc),
                ],
                spacing=12,
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            self.calc_inputs,
            self.calc_status,
            ft.Divider(),
            self.calc_list,
            subtitle="Each one you add shows up in the report with the work written out.",
        )

    def _render_calc_inputs(self):
        key = self.calc_dd.value
        labels = chem.CALCULATIONS[key][1]
        self._input_fields = [
            ft.TextField(label=lbl, dense=True, border_radius=8, width=240) for lbl in labels
        ]
        self.calc_inputs.controls = [ft.Row(self._input_fields, spacing=12, wrap=True)]

    def _calc_changed(self, e):
        self._render_calc_inputs()
        self.calc_status.controls = []
        self.page.update()

    def _do_calc(self, e):
        key = self.calc_dd.value
        name, labels, fn = chem.CALCULATIONS[key]

        try:
            args = [float(f.value.strip()) for f in self._input_fields]
        except (ValueError, AttributeError):
            self._show(self.calc_status, banner("Every box needs a number.", "error"))
            return

        try:
            result = fn(*args)
        except NotBuiltYet as nb:
            self._show(self.calc_status, banner(f"Not built yet — {nb.step}", "todo"))
            return
        except Exception as ex:
            self._show(self.calc_status, banner(str(ex), "error"))
            return

        self.calc_results.append(result)
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
                                ft.Text(f"{c.name} = {c.pretty()}", weight=ft.FontWeight.BOLD),
                                ft.Text(c.work or c.formula, size=11, color=ft.Colors.ON_SURFACE_VARIANT),
                            ],
                            spacing=2,
                            expand=True,
                        ),
                        ft.IconButton(icon=ft.Icons.DELETE_OUTLINE, icon_size=18, on_click=remove(i)),
                    ]
                ),
                bgcolor=ft.Colors.SURFACE_CONTAINER_HIGHEST,
                padding=12,
                border_radius=8,
            )
            for i, c in enumerate(self.calc_results)
        ]

    # -- 6. report --------------------------------------------------------
    def _report_section(self):
        self.report_status = ft.Column(controls=[], spacing=8)
        self.preview = ft.Markdown(value="", selectable=True)
        self.save_btn = ft.OutlinedButton(
            "Save as .md", icon=ft.Icons.DOWNLOAD, disabled=True, on_click=self._save
        )
        self._report_text = ""

        return section(
            "6. Your report",
            ft.Icons.DESCRIPTION,
            ft.Row(
                [
                    ft.FilledButton(
                        "Generate report", icon=ft.Icons.PLAY_ARROW, on_click=self._generate
                    ),
                    self.save_btn,
                ],
                spacing=10,
            ),
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
                purpose=self.f_purpose.value or "",
                hypothesis=self.f_hypothesis.value or "",
                materials=self.f_materials.value or "",
                procedure=self.f_procedure.value or "",
                observations=self.f_observations.value or "",
                conclusion=self.f_conclusion.value or "",
            ),
            data=DataTable(headers=list(self.headers), rows=[list(r) for r in self.rows]),
            calculations=list(self.calc_results),
        )

    def _generate(self, e):
        try:
            text = report_mod.build_report(self._collect())
        except NotBuiltYet as nb:
            self._show(self.report_status, banner(f"Not built yet — {nb.step}", "todo"))
            return
        except Exception as ex:
            self._show(self.report_status, banner(f"{type(ex).__name__}: {ex}", "error"))
            return

        self._report_text = text or ""
        self.preview.value = self._report_text
        self.save_btn.disabled = not self._report_text
        self.report_status.controls = []
        self.page.update()

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
