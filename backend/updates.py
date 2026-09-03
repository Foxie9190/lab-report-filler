"""
Update check. Claude's file — plumbing, not science.

On launch the app asks GitHub for the newest release and, if it's newer
than the version running, shows a strip with a Download button. That's
it — no downloading in the background, no replacing files. The person
grabs the new zip the same way they got the first one.

Bump VERSION every time you tag a release, and use the same number:

    VERSION = "1.1.0"      <- here
    git tag v1.1.0         <- on the command line
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass

VERSION = "1.0.0"
REPO = "Foxie9190/lab-report-filler"

API_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
RELEASES_PAGE = f"https://github.com/{REPO}/releases/latest"


@dataclass
class Update:
    version: str   # e.g. "1.1.0"
    url: str       # the page to send people to


def _as_tuple(version: str) -> tuple[int, ...]:
    """'v1.2.3' -> (1, 2, 3), so versions compare numerically, not as text.

    Text comparison gets "1.10.0" < "1.9.0" wrong. Tuples don't.
    Anything that isn't a number becomes 0, so a weird tag can't crash us.
    """
    parts = []
    for piece in version.strip().lstrip("vV").split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def is_newer(latest: str, current: str = VERSION) -> bool:
    return _as_tuple(latest) > _as_tuple(current)


def check_for_update(timeout: float = 4.0) -> Update | None:
    """Ask GitHub for the latest release. Returns None if we're current,
    offline, or anything at all goes wrong — an update check must never
    stop the app from opening.
    """
    try:
        req = urllib.request.Request(
            API_URL,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": f"lab-report-filler/{VERSION}",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
        tag = str(data.get("tag_name", "")).strip()
        url = str(data.get("html_url") or RELEASES_PAGE)
        if tag and is_newer(tag):
            return Update(version=tag.lstrip("vV"), url=url)
    except Exception:
        pass
    return None
