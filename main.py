"""
Lab Report Filler — entry point.

Run it:
    python main.py            # opens in your browser (web app)
    python main.py desktop    # opens as a Mac desktop window instead
"""

import sys

import flet as ft

from ui import LabReportApp


def main(page: ft.Page):
    LabReportApp(page)


if __name__ == "__main__":
    desktop = len(sys.argv) > 1 and sys.argv[1].lower() in ("desktop", "app")

    if desktop:
        # Desktop window: let Flet grab any free port, so a stuck process
        # from an earlier run can never block this one.
        ft.run(main, view=ft.AppView.FLET_APP, assets_dir="assets")
    else:
        # Browser: pin the port so the URL is always http://localhost:8550
        ft.run(main, view=ft.AppView.WEB_BROWSER, port=8550, assets_dir="assets")
