# Your half — step by step

I built the whole interface. You build the brains. Two files, and they're
independent, so if one gets annoying you can jump to the other.

**Order I'd do them in:** Step 1 → Step 2.
Step 1 gives you a real report on screen fastest, which makes the rest way
more motivating.

Run the app any time to see where you're at:

```bash
python main.py
```

Anything you haven't written yet shows an amber "not built yet" strip instead
of crashing. The app always runs.

---

## Step 1 — Make a report come out (`backend/report.py`)

**Do this first.** No math, no APIs, just building a string.

**The job:** `build_report(report)` takes a `LabReport` and returns Markdown text.

**You already have** three helpers in that file — `markdown_table()`,
`bullet_list()`, `numbered_list()`. Use them, don't rewrite them.

**Start here:**

```python
def build_report(report: LabReport) -> str:
    info = report.info
    c = report.content
    chunks = []

    chunks.append(f"# {info.title or 'Lab Report'}")
    chunks.append(f"**Name:** {info.student_name}  \n**Class:** {info.course}  \n**Date:** {info.date}")

    if c.materials:
        chunks.append("## Material list\n\n" + bullet_list(c.materials))

    # ... you take it from here

    return "\n\n".join(chunks)
```

**Done when:** you hit *Generate report* and see your info formatted in the
preview box.

**Then level it up:**
- Skip empty sections (that `if c.materials:` pattern) so blank fields don't
  leave lonely headings.
- Add safety precautions: `bullet_list(c.safety)`.
- Add the data table: `markdown_table(report.data)`.
- Loop `report.calculations` and print each one's `name`, `work`, and
  `pretty()`.
- Loop `report.analysis` and print each `q.question` / `q.answer` pair.

The template you are building, in order: title, material list, safety
precautions, data, calculations, analysis questions.

**Gotcha:** in Markdown, two spaces at the end of a line = line break. That's
why the `**Name:**` line above has trailing spaces before `\n`. Easy to
delete by accident.

---

## Step 2 — The chemistry math (`backend/chem.py`)

Five small functions. I did `percent_error` completely — read it, then copy
the shape.

Each one:
1. Check for bad input, `raise ValueError("plain english message")`.
2. Do the math.
3. Return a `CalcResult` with the `work` string filled in.

**Easiest → hardest:** `percent_yield`, `density`, `moles_from_grams`,
`molarity`, `average`.

Test one without opening the app:

```bash
python -c "from backend.chem import density; print(density(24.8, 3.1).work)"
```

**Done when:** you pick it in the dropdown, type numbers, hit *Calculate & add*,
and it shows up in the list with the work written out.

**Gotcha:** `average` takes a *list*, not two numbers, so it isn't in the
dropdown menu. Write it anyway — you'll want it in `build_report` to average
your trials.

---

## If it breaks

| What you see | What it means |
|---|---|
| `ModuleNotFoundError: flet` | `pip install -r requirements.txt` |
| `NotBuiltYet` in the terminal | That function is still a stub. Expected. |
| Amber strip in the app | Same thing, just prettier. |
| Red strip in the app | Your code raised an error. The message is yours — read it. |
| App won't start at all | Python syntax error. The terminal shows the line number. |
| First run hangs ~20s | Normal. It's downloading the web build once. |

Stuck on something for more than 20 minutes? Bring me the error and the
function you wrote, and we'll fix it together.
