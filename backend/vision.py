"""
=============================================================================
  YOUR FILE #2 — the "read my picture" part
=============================================================================

This is the piece that makes the app feel magic: you snap a photo of your
handwritten data table (or the lab handout), and it fills in the form.

How it works, in one breath:
  image bytes -> base64 text -> send to Claude's API with a prompt that says
  "give me JSON with these exact keys" -> parse the JSON -> return a dict.

The app works fine without this. If there's no API key, the UI just hides
the picture button and you type things in manually.

See BACKEND_GUIDE.md → Step 2.
"""

from __future__ import annotations

import base64
import json
import os

from .models import NotBuiltYet

# The keys the UI knows how to fill in. Your JSON should use these names.
# (Anything extra is ignored; anything missing is just left blank.)
EXPECTED_KEYS = [
    "title",
    "materials",           # string, one item per line
    "safety",              # string, one precaution per line
    "data_headers",        # list of strings
    "data_rows",           # list of lists of strings
    "analysis_questions",  # list of {"question": ..., "answer": ...}
]


def api_key_present() -> bool:
    """True if an Anthropic API key is set. The UI calls this to decide
    whether to show the picture-upload panel.

    DONE for you — no need to touch.
    """
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def to_base64(image_bytes: bytes) -> str:
    """Turn raw file bytes into the base64 text the API wants.

    DONE for you — this is the boring part.
    """
    return base64.standard_b64encode(image_bytes).decode("utf-8")


def guess_media_type(filename: str) -> str:
    """Claude's API needs to be told the image type.

    DONE for you.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    return {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "image/jpeg")


# ---------------------------------------------------------------------------
# YOUR TURN
# ---------------------------------------------------------------------------


def extract_from_images(images: list[tuple[bytes, str]]) -> dict:
    """Send picture(s) to Claude and get back lab-report fields.

    Args:
        images: list of (raw_file_bytes, filename) pairs.

    Returns:
        A dict using the keys in EXPECTED_KEYS. Missing keys are OK.

    Rough recipe:

        from anthropic import Anthropic
        client = Anthropic()          # reads ANTHROPIC_API_KEY automatically

        content = []
        for raw, name in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": guess_media_type(name),
                    "data": to_base64(raw),
                },
            })
        content.append({"type": "text", "text": PROMPT})

        msg = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2000,
            messages=[{"role": "user", "content": content}],
        )
        text = msg.content[0].text
        return json.loads(text)

    Two things that WILL bite you, so plan for them:
      1. The model sometimes wraps JSON in ```json ... ``` fences.
         Strip them before json.loads(), or use the helper below.
      2. Never trust the shape. Wrap json.loads() in try/except and raise a
         ValueError with a friendly message if it fails — the UI shows it.
    """
    raise NotBuiltYet("Step 2 — extract_from_images in backend/vision.py")


def strip_code_fences(text: str) -> str:
    """Helper for problem #1 above. DONE for you — just call it.

    Turns  ```json\\n{...}\\n```  into  {...}
    """
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


# A starting prompt. Tweak the wording once you see what it gets wrong —
# that tuning is most of the work in AI features.
PROMPT = f"""You are reading a photo of a student's chemistry lab — it may be a
handwritten data table, lab notebook page, or a printed lab handout.

Extract whatever you can and reply with ONLY a JSON object, no other text.
Use these keys (omit any you can't find, never invent data):

{json.dumps(EXPECTED_KEYS, indent=2)}

Rules:
- "materials" and "safety" are strings with one item per line.
- "data_headers" is a list of column names, e.g. ["Trial", "Mass (g)"].
- "data_rows" is a list of rows, each row a list of strings, same length as
  data_headers.
- "analysis_questions" is a list of objects, each {{"question": "...",
  "answer": "..."}}. If the answer is blank on the page, use "".
- Keep the student's own numbers exactly as written. Do not round or correct.
- If the handwriting is unclear on a number, use your best read and nothing else.
"""
