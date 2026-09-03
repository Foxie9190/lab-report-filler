# Turning this into a proper project

Three separate things. Do them in any order.

---

## 1. Git — DONE

Already set up. You're on branch `main` with one commit.

Day-to-day, after you write a function:

```bash
git add -A
git commit -m "Add density calculation"
```

Useful when you break something:

```bash
git status                 # what changed
git diff                   # show me the actual changes
git log --oneline          # history
git restore backend/chem.py   # undo my changes to this file since last commit
```

That last one is the reason git is worth it. Try something wild, and if it
goes badly you're one command from where you started.

### Your commit email

I set this repo to commit as `landongordon1029@gmail.com`. If you push to a
**public** repo, that email is visible in the commit history forever. To use
GitHub's private alias instead:

```bash
git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"
```

Your exact noreply address is on GitHub under Settings → Emails. Set it
*before* you push, since rewriting history afterward is a pain.

---

## 2. GitHub

I can't do this part — it needs your login.

1. Go to [github.com/new](https://github.com/new)
2. Name it `lab-report-filler`
3. **Leave every checkbox unchecked** — no README, no .gitignore, no license.
   You already have those, and checking them causes a merge conflict on your
   very first push.
4. Create, then run what it shows you, which will be:

```bash
git remote add origin https://github.com/YOUR_USERNAME/lab-report-filler.git
git push -u origin main
```

After that first one, pushing is just `git push`.

**Private or public?** Private is the safe default for schoolwork. You can
flip it public later in one click. If your school has a policy about posting
coursework, that decision is yours to check.

---

## 3. Claude Project

Keeps the context so you don't have to re-explain the app every time.

**In the Claude desktop app** (needs a paid plan — Pro, Max, Team, or Enterprise):

1. **Projects** in the left sidebar → **+**
2. Choose **Use an existing folder**
3. Point it at `~/Desktop/lab-report-filler`
4. Paste the instructions below into the instructions box
5. **Create**

### Instructions to paste

```
This is a Flet (Python) web app that fills out chemistry lab reports. You
type your parameters in and it builds a formatted Markdown report.

The report template is exactly five sections: title of lab, material list,
safety precautions, data tables, analysis questions.

HOW WE SPLIT THE WORK
- Landon writes the backend: backend/chem.py, report.py
- Claude writes the UI: ui/app.py, ui/theme.py
- backend/models.py is the contract between them. Don't change its shapes
  without updating both sides.

WHEN LANDON IS STUCK ON HIS PART
Explain the concept and point at the specific line. Don't paste a finished
function unless he asks for it outright — the point of this project is that
he learns the backend. Debugging his code together is fair game.

FLET VERSION GOTCHAS (0.86 — most examples online are for older versions
and will not run)
- Entry point is ft.run(main), NOT ft.app(target=main)
- Auto-update is on. Setting a property updates the UI. No page.update()
  needed after property changes.
- FilePicker is async: await picker.pick_files(with_data=True) returns the
  files directly. There's no on_result callback anymore.
- FilePicker is a Service and self-registers. Keep a reference to it or it
  gets garbage collected.
- Buttons take content="Label", not text="Label"
- Dropdown uses on_select, not on_change; options are ft.DropdownOption
- ft.padding.symmetric() is gone. Use a plain number or ft.Padding(...)
- Image takes src (a data: URI works), not src_base64
- Snackbars: page.show_dialog(ft.SnackBar(ft.Text("hi")))

CONVENTIONS
- Unwritten backend functions raise NotBuiltYet(step). The UI catches it and
  shows an amber notice instead of crashing. Keep that pattern — the app
  should run at every stage.
- Backend functions raise ValueError with a plain-English message for bad
  input. The UI shows it in red.

SCHOOLWORK
The analysis answers are what a teacher actually grades. Help draft and
edit, but flag it if the work is drifting toward Claude writing the science
instead of Landon.
```

Adjust that however you want once you know what's actually annoying.

---

## The .vscode folder

Also set up. Open the folder in VS Code and:

- **F5** runs the app (two options in the dropdown: web or desktop window)
- It'll use `.venv` automatically
- It'll offer to install the Python extension if you don't have it
