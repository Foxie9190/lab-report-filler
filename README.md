# Lab Report Filler

A Mac app for writing chemistry lab reports. Fill in the form, let it do
the math and show the work, and get a finished Word document you can
turn in.

No account. No internet. Nothing leaves your computer.

![Lab info, materials and data tables](assets/Screenshot1.png)

![Calculations, analysis questions and Word export](assets/Screenshot2.png)

## Install

1. Download **Lab Report Filler.zip** from the
   [Releases page](https://github.com/Foxie9190/lab-report-filler/releases).
2. Double-click the zip. You get **Lab Report Filler.app**.
3. Drag it into your **Applications** folder.
4. **The first time only:** right-click the app and choose **Open**, then
   click **Open** again in the box that pops up.

That last step matters. The app isn't signed with an Apple developer
certificate, so macOS will say it's from an unidentified developer, or
that it's "damaged," if you just double-click. Right-click → Open tells
your Mac you trust it. After that, it opens normally.

If your Mac still refuses, go to **System Settings → Privacy & Security**,
scroll down, and click **Open Anyway** next to the app's name.

## What it makes

Every report follows the same five-part template:

1. **Title of lab** — plus your name, class, teacher, date, and lab partners
2. **Material list**
3. **Safety precautions**
4. **Data tables** — as many tables, rows and columns as you need
5. **Analysis questions** — the questions off the lab sheet with your answers

Calculations go in between the data and the questions. Each one prints
the formula, the numbers plugged in, and the answer with its unit, so it
reads like you worked it out by hand.
![Filling in the form](assets/Screenshot1.png)
![Filling in the form Continued](assets/Screenshot2.png)


## Using it

Work top to bottom. Nothing is required — any section you leave blank is
simply left out of the report.

**Lab info** — title, name, class, and so on.

**Materials & safety** — one item per line. They become bullet points.

**Data tables** — click a column header to rename it. *Add row*,
*Add column* and *Remove last column* do what they say; the × on a row
deletes it. If one lab needs more than one table, hit *Add table* — each
gets its own name and prints separately in the report.

**Calculations** — pick one from the dropdown, type the numbers, and hit
*Calculate & add*. It shows up below with the work written out. The
**Unit** box fills in on its own, but you can type over it.

Built-in calculations: percent error, percent yield, density, moles from
grams, molarity, and average. *Average* works a little differently: you
add one number at a time, each one locks in as a chip, and then you
calculate. That way you can check every value before it goes in.

**Analysis questions** — a question box and an answer box per row.
*Add question* for more.

**Your report** — hit *Generate report* to see a preview, then
**Save as Word** to get a `.docx`. There's also *Save as .md* if you want
plain text.

## Word export

The Word file is a real document, not exported text: a colored title
band, section headings, a proper data table with a shaded header, boxed
calculations, numbered questions. Open it in Word, Pages, or Google Docs.

Pick a look from the **Word theme** dropdown:

| Theme | Feel |
|---|---|
| Teal | The default. Matches the app. |
| Navy | Classic, safe for any teacher. |
| Crimson | Bold. |
| Forest | Green. |
| Plum | Purple. |
| Slate (print-friendly) | Grey. Costs the least ink. |

Three toggles sit next to it:

- **Show formulas** — the italic formula line under each calculation
- **Striped data rows** — alternate shading in the table
- **Flag unanswered questions** — prints *(not answered)* where you left
  an answer blank, so you catch it before you submit. Turn it off for a
  clean copy.

## Troubleshooting

**"Lab Report Filler can't be opened" / "is damaged"** — see step 4 under
Install. Right-click → Open, or *Open Anyway* in Privacy & Security.

**Amber "not built yet" strip** — that calculation isn't finished yet.
The rest of the app works.

**Red strip** — bad input, like dividing by zero. The message says what
went wrong.

**A blank answer printed "(not answered)"** — that's the flag doing its
job. Uncheck *Flag unanswered questions* before saving if you want it
left empty.

**The app won't open and nothing happens** — quit it fully (right-click
its Dock icon → Quit, or ⌘Q) and open it again.

## Status

Working end to end. Two calculations — moles from grams and molarity —
are still being finished and show a "not built yet" notice for now.

---

## For developers

The app is Python, built with [Flet](https://flet.dev). If you want to
run it from source or change it:

```bash
git clone https://github.com/Foxie9190/lab-report-filler.git
cd lab-report-filler
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py desktop        # or `python3 main.py` for a browser tab
```

Needs Python 3.11 or newer. The first run takes about twenty seconds
while Flet fetches its runtime.

### Layout

```
main.py                 start here — desktop or browser
ui/
  app.py                every screen, button and box
  theme.py              colors and the card / banner helpers
backend/
  models.py             the shared data shapes the UI and backend agree on
  chem.py               the chemistry math
  report.py             builds the Markdown preview
  export_docx.py        builds the Word document and holds the themes
requirements.txt        flet + python-docx
```

The UI and the backend only talk through the objects in `models.py`. The
UI never reaches into the math, and the math never touches a button.

### Making it yours

**Add a calculation.** Write a function in `chem.py` that takes plain
numbers and returns a `CalcResult`, then add one line to the
`CALCULATIONS` dictionary at the bottom of the file. It appears in the
dropdown next time you start the app. `percent_error` is a complete
example to copy from.

**Add a Word theme.** Add an entry to `THEMES` at the top of
`export_docx.py` — six hex colors. It shows up in the dropdown
automatically.

**Change the app's colors.** `ui/theme.py`, top of the file.

### Building the .app

```bash
pip install pyinstaller
flet pack main.py --name "Lab Report Filler"
```

The bundle lands in `dist/`. Zip it and attach it to a GitHub release.

**Port already in use** when running from source in browser mode means
an old copy is still running: `kill $(lsof -ti :8550)`. Desktop mode
picks a free port on its own.
