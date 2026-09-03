# Lab Report Filler

A web app for chemistry lab reports. Type your data in and it builds a
formatted report you can save.

Built with Flet (Python), so the whole thing is Python. No HTML, no JavaScript.

## Setup

```bash
cd lab-report-filler
python3 -m venv .venv
source .venv/bin/activate          # macOS/Linux
pip install -r requirements.txt
python main.py
```

Opens at `http://localhost:8550`. **First run takes ~20 seconds** while Flet
downloads its web build — that's one time only.

Desktop window instead of a browser tab:

```bash
python main.py desktop
```

## What's where

```
main.py              entry point
ui/                  the interface — Claude's part, already done
  app.py               all the screens and buttons
  theme.py             colors and the card/banner helpers
backend/             the brains — YOUR part
  models.py            shared data shapes (done, just read it)
  chem.py              chemistry math          <- Step 2
  report.py            builds the Markdown     <- Step 1
BACKEND_GUIDE.md     step-by-step instructions for the above
```

**Start with `BACKEND_GUIDE.md`.** The app runs right now — anything you
haven't written yet shows an amber "not built yet" strip instead of crashing,
so you can build it one function at a time and watch pieces light up.

## How the two halves talk

The UI never reaches into your logic. It only ever calls:

| UI action | Your function |
|---|---|
| *Calculate & add* | `chem.CALCULATIONS[key][2](...)` |
| *Generate report* | `report.build_report(...)` |

They pass the objects in `backend/models.py` back and forth. As long as your
functions take and return those, you can rewrite the insides however you like
and the UI keeps working.

Adding your own calculation is one line — write the function, then add an
entry to the `CALCULATIONS` dict at the bottom of `chem.py`. It shows up in
the dropdown automatically.
