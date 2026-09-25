# Roadmap to 3.0

Where 2.0 is a chemistry lab report filler, 3.0 is a **schoolwork app with
tabs**: Chemistry, Math, and a Homework tracker — plus a live preview that
shows the finished document building itself as you type.

Nothing here has to land all at once. Each phase below is shippable on its
own as 2.1, 2.2, 2.3, and 3.0 is the version where the tab bar and all
three tabs are in.

---

## The four pieces

1. **Saving and loading** — the foundation everything else needs
2. **Live document preview** — a button that flips the form into the page
3. **Math tab** — its own layout, its own solver
4. **Homework tracker tab** — a completely different kind of screen

---

## Phase 1 — Saving and loading (ship as 2.1)

**Why this first.** Right now the app forgets everything when you close it.
That's survivable for one lab you finish in one sitting. A homework
tracker that forgets your homework is useless, so saving has to exist
before the tracker does. Doing it first also means the chemistry tab gets
"pick up where you left off" for free.

**What it does**

- Autosave as you type, so closing the window never loses work
- Keeps each tab's data separate
- `Open` and `Save As` for report files, so one lab can be kept and
  reopened later

**How**

- One file per tab under the app's own data folder (Tauri's
  `appDataDir()`), written with the `fs` plugin that Save as Word already
  uses
- JSON, because `LabReport` is already a plain object — `JSON.stringify`
  is the whole save function
- Debounce the writes: save 500 ms after typing stops, not on every
  keystroke
- A `version` number inside the file, so a file written by 2.1 can still
  be opened by 3.0 after the shape changes

**Watch out for:** a saved file from an older version missing fields the
new code expects. The loader should fill in anything missing rather than
trusting the file, or one old save crashes the app on launch.

---

## Phase 2 — Live document preview (ship as 2.2)

**What it does.** A button flips the report card between *editing* and
*page view*: the actual document, on a white page, in the Word theme's
colours — headings, the shaded table header, the boxed calculations,
numbered questions. It updates as you type.

**The design decision that matters.** There are two ways to build this,
and only one of them is maintainable:

- ✗ Write a second renderer that draws HTML from `LabReport`. Now every
  change to the report has to be made twice, and the preview drifts out of
  sync with the real Word file. This is the trap.
- ✓ Split the middle out. `exportDocx.ts` currently goes straight from
  `LabReport` to Word paragraphs. Instead, add a step that turns a
  `LabReport` into a **list of blocks** — heading, paragraph, bullets,
  table, calc box, question — and then have *two* renderers read that same
  list: one makes Word objects, one makes HTML.

```
LabReport ──► buildDocument() ──► Block[] ──┬──► docx renderer  ──► .docx
                                            └──► html renderer  ──► preview
```

That way the preview is true by construction: if it looks right on screen,
the Word file matches, because both came from the same blocks.

**Steps**

1. Define the `Block` types in `models.ts` (`models.ts` is the file both
   sides already agree on)
2. Move the section-by-section logic out of `exportDocx.ts` into
   `buildDocument()` — no behaviour change, tests should still pass
3. Rewrite the Word builder to walk `Block[]` (it gets shorter)
4. Write the HTML renderer — one function per block type
5. Style the page: white sheet, drop shadow, Letter aspect ratio, theme
   colours from the same `THEMES` object
6. Wire the toggle button, and re-render on input (debounced)

**Bonus once this exists:** the Markdown preview can also be rebuilt from
`Block[]`, so `report.ts` stops being a third place the same structure
gets written out.

---

## Phase 3 — Tabs and the Math tab (ship as 2.3)

**The tab bar comes back**, but built to hold any number of subjects
rather than two hardcoded ones.

**How**

- Each tab is a module that exports the same small shape:
  `{ id, label, build(host) }`
- `main.ts` holds a list of those modules and builds the tab bar from it,
  so adding a subject is one import and one array entry — same trick as
  `CALCULATIONS` and `THEMES`
- Each tab owns its own state object and its own save file
- Only the visible tab is built, so startup stays fast

**The Math tab's own layout**

- A problem list instead of the five report sections: each row is a
  problem with the work shown and the answer
- An expression box: type `3x + 7 = 22` or `sin(30) + 2^3`
- Steps, not just answers — the point is homework you can hand in
- Its own export: a numbered problem sheet with name and class at the top

**The solver is the interesting part, and it's yours to write.** It needs
a real parser — tokenise, parse to a tree, evaluate — *not* `eval()` or
`new Function()`, both of which run whatever was typed as code. Roughly:

1. Arithmetic with precedence (`2 + 3 × 4` is 14, not 20)
2. Functions and constants (`sqrt`, `sin`, `pi`), degrees mode
3. Variables (`x = 5`), and `ans` for the last answer
4. Solving simple linear equations for a variable, with the steps recorded
   as it goes

Steps 1–3 are the calculator that came out of 2.0. Step 4 is what makes it
a math tab instead of a calculator.

---

## Phase 4 — Homework tracker (ship as 3.0 with everything above)

A different kind of screen: no document, no export, just a list you keep.

**What it holds.** Per assignment: subject, what it is, due date, status
(to do / doing / done), and a notes line.

**What it does**

- Add, edit, delete, and tick off
- Sorted by due date, with overdue and due-today marked
- Filter by subject or by status
- A count at the top: how many due this week
- Saved automatically (Phase 1 is why this is easy)

**Later, if it earns it:** a reminder when something is due tomorrow, and
a link from an assignment to the lab report it belongs to.

**Watch out for:** dates. "Due tomorrow" needs today's date in *local*
time, and `new Date("2026-05-04")` is parsed as UTC, which can read as the
day before. Store dates as plain `YYYY-MM-DD` strings and compare them as
strings — no timezone maths, no bugs.

---

## Who writes what

Same split as 2.0, which worked:

- **Landon:** everything in `src/backend` — the math solver, the tracker's
  logic, `buildDocument()`, the save/load functions. Taught step by step,
  one piece at a time.
- **Claude:** the interface, the CSS, the tab shell, the preview's HTML
  renderer.
- They only talk through the types in `models.ts`.

## Order, and why

Saving first because the tracker can't exist without it. Preview second
because it's self-contained and makes the app feel finished. Tabs third,
since the tab shell is easier to build once there are two real things to
put in it. Tracker last because it's the biggest new surface.

## Still to decide

- Does the Math tab export Word too, or PDF, or just print?
- Does the tracker need subjects it can learn (type a new one and it's
  remembered), or a fixed list?
- Should the preview show page breaks, or one long page?
