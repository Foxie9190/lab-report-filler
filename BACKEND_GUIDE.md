# Your half — step by step

I built the whole interface. You build the brains. Three files, and they're
independent, so if one gets annoying you can jump to another.

**Order I'd do them in:** Step 3 → Step 1 → Step 2.
Step 3 gives you a real report on screen fastest, which makes the rest way
more motivating.

Run the app any time to see where you're at:

```bash
python main.py
```

Anything you haven't written yet shows an amber "not built yet" strip instead
of crashing. The app always runs.

---

## Step 3 — Make a report come out (`backend/report.py`)

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

    if c.purpose:
        chunks.append("## Purpose\n\n" + c.purpose)

    # ... you take it from here

    return "\n\n".join(chunks)
```

**Done when:** you hit *Generate report* and see your info formatted in the
preview box.

**Then level it up:**
- Skip empty sections (that `if c.purpose:` pattern) so blank fields don't
  leave lonely headings.
- Add the data table: `markdown_table(report.data)`.
- Loop `report.calculations` and print each one's `name`, `work`, and
  `pretty()`.

**Gotcha:** in Markdown, two spaces at the end of a line = line break. That's
why the `**Name:**` line above has trailing spaces before `\n`. Easy to
delete by accident.

---

## Step 1 — The chemistry math (`backend/chem.py`)

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

## Step 2 — The picture reader (`backend/vision.py`)

This is the fun one, and the only one that needs setup.

### 2a. Get a key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → create one.
2. It needs a few dollars of credit. Reading one lab photo costs a fraction
   of a cent, but the account can't be at zero.
3. `cp .env.example .env`, paste your key in, save.
4. Restart the app. The amber "no API key" strip should be gone.

**Never commit `.env`.** It's already in `.gitignore` — leave it there. A key
pushed to GitHub gets found by bots in minutes and run up on someone else's bill.

### 2b. Write the function

```bash
pip install anthropic
```

`extract_from_images(images)` gets a list of `(bytes, filename)` pairs and
returns a dict. The docstring in the file has the full recipe — follow it.

The shape is:

```
build a content list -> one image block per photo, then your text prompt
send it -> client.messages.create(...)
get text back -> msg.content[0].text
clean it -> strip_code_fences(text)
parse it -> json.loads(...)
```

**Done when:** you pick a photo of a data table, hit *Read with AI*, and the
form fills in.

**Two things that will definitely happen:**
1. **The model wraps JSON in ```json fences.** That's why
   `strip_code_fences()` exists. Call it before `json.loads()`.
2. **`json.loads` blows up anyway** at some point. Wrap it:

```python
try:
    return json.loads(strip_code_fences(text))
except json.JSONDecodeError:
    raise ValueError("Claude didn't send back clean JSON. Try a clearer photo.")
```

The UI catches `ValueError` and shows your message in red. Write messages
you'd actually want to read at 11pm.

**When it half-works:** that's normal, and fixing it means editing the
`PROMPT` at the bottom of the file, not the Python. If it keeps guessing at
smudged numbers, add a line telling it not to. Prompt-tuning *is* the work
on AI features.

---

## Bonus, only if you want it

`suggest_conclusion()` in `report.py` — auto-draft a conclusion paragraph.

Real talk before you build it: the conclusion is the part your teacher is
actually grading. Using this to generate a first draft you then rewrite is
a genuinely useful tool. Pasting the output straight in is the thing that
gets people in trouble, and it's also just a worse conclusion than yours,
because the model wasn't standing at the lab bench. Check what your school's
policy actually says before you lean on it.

Everything else in this app — the formatting, the math, the transcription —
is you doing your own work faster. That part's all upside.

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
