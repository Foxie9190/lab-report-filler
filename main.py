"""
Lab Report Filler — entry point.

Run it:
    python main.py            # opens in your browser (web app)
    python main.py desktop    # opens as a Mac desktop window instead
"""

import sys

import flet as ft

# Loads your ANTHROPIC_API_KEY out of the .env file, if you made one.
# Wrapped in try/except so the app still runs before you pip install anything.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from ui import LabReportApp


def main(page: ft.Page):
    LabReportApp(page)


if __name__ == "__main__":
    desktop = len(sys.argv) > 1 and sys.argv[1].lower() in ("desktop", "app")

    ft.run(
        main,
        view=ft.AppView.FLET_APP if desktop else ft.AppView.WEB_BROWSER,
        port=8550,
        upload_dir="uploads",
        assets_dir="assets",
    )
