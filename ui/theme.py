"""Colors and small styling helpers."""

import flet as ft

SEED = ft.Colors.TEAL_600

ACCENT = ft.Colors.TEAL_700
TODO_BG = ft.Colors.AMBER_100
TODO_FG = ft.Colors.AMBER_900
ERROR_BG = ft.Colors.RED_100
ERROR_FG = ft.Colors.RED_900
OK_BG = ft.Colors.GREEN_100
OK_FG = ft.Colors.GREEN_900

MAX_WIDTH = 920


def section(title: str, icon, *controls, subtitle: str | None = None) -> ft.Card:
    """A titled card. Everything in the app is one of these."""
    head = [
        ft.Row(
            [
                ft.Icon(icon, color=ACCENT, size=20),
                ft.Text(title, size=17, weight=ft.FontWeight.BOLD),
            ],
            spacing=10,
        )
    ]
    if subtitle:
        head.append(ft.Text(subtitle, size=12, color=ft.Colors.ON_SURFACE_VARIANT))
    head.append(ft.Container(height=4))

    return ft.Card(
        content=ft.Container(
            content=ft.Column(controls=[*head, *controls], spacing=10),
            padding=18,
        ),
        elevation=1,
    )


def banner(text: str, kind: str = "todo") -> ft.Container:
    """Inline colored message strip."""
    bg, fg, icon = {
        "todo": (TODO_BG, TODO_FG, ft.Icons.CONSTRUCTION),
        "error": (ERROR_BG, ERROR_FG, ft.Icons.ERROR_OUTLINE),
        "ok": (OK_BG, OK_FG, ft.Icons.CHECK_CIRCLE_OUTLINE),
    }[kind]
    return ft.Container(
        content=ft.Row(
            [
                ft.Icon(icon, color=fg, size=18),
                ft.Text(text, color=fg, size=13, expand=True, selectable=True),
            ],
            spacing=10,
        ),
        bgcolor=bg,
        padding=12,
        border_radius=8,
    )


def field(label: str, hint: str = "", multiline: bool = False, lines: int = 3) -> ft.TextField:
    return ft.TextField(
        label=label,
        hint_text=hint or None,
        multiline=multiline,
        min_lines=lines if multiline else 1,
        max_lines=lines + 6 if multiline else 1,
        dense=True,
        border_radius=8,
    )
