# Lab Report Filler

A Mac, Windows and Linux app for writing chemistry lab reports. Fill in the
form, let it do the math and show the work, and get a finished Word
document you can turn in.

No account. Nothing you type leaves your computer. The only time it
touches the internet is a quick check on launch for a newer version — if
there is one, a strip at the top offers a download link. That's all it
does; it never installs anything on its own.

## Which version do you want?

**Version 2 (current)** — the app rewritten in TypeScript + Tauri. Same
five report sections, plus multiple data tables, a running list of your
calculations, unit conversion, light and dark themes, accent colours, and
a Word export with six themes or any colour you pick. Mac, Windows and
Linux.

**Version 1.2.0 (Python / Flet)** — the original, still available for
**Mac, Windows and Linux**. Download it from the
[v1.2.0 release](https://github.com/Foxie9190/lab-report-filler/releases/tag/v1.2.0),
and its code lives on in this repo (`main.py`, `ui/`, `backend/`) if you
want to run or build it yourself:

```bash
pip install -r requirements.txt
python main.py
```

Both write the same kind of lab report. Version 2 is the one getting new
features.

## Install — version 2

Go to the
[Releases page](https://github.com/Foxie9190/lab-report-filler/releases)
and download the file for your computer from **Assets**.

**macOS** — the `.dmg`. Open it, drag **Lab Report Filler** into your
Applications folder. **The first time only:** right-click the app and
choose **Open**, then **Open** again. The app isn't signed with an Apple
developer certificate, so a plain double-click gets refused. One file
covers both Apple Silicon and Intel Macs.

**Windows** — the `.exe` installer (or the `.msi` if you prefer). Windows
shows a blue **"Windows protected your PC"** box: click **More info**,
then **Run anyway**. Same reason — no paid signing certificate.

**Linux** — the `.AppImage` runs anywhere: `chmod +x` it and double-click.
On Debian or Ubuntu the `.deb` installs it properly:
`sudo dpkg -i lab-report-filler_2.0.0_amd64.deb`.

## Install — version 1 (Mac, Windows, Linux)

Go to the
[Releases page](https://github.com/Foxie9190/lab-report-filler/releases)
and scroll down to **Assets**. Download the zip for your computer — *not*
"Source code (zip)" or "Source code (tar.gz)", which GitHub adds
automatically and contain the code, not the app.

Either way, the very first launch takes about twenty seconds while the app
unpacks itself. It looks frozen. It isn't. After that it opens quickly.

### macOS — `Lab-Report-Filler-macOS.zip`

1. Double-click the zip. You get **Lab Report Filler.app** (possibly
   inside a folder of the same name).
2. Drag it into your **Applications** folder.
3. **The first time only:** right-click the app and choose **Open**, then
   click **Open** again in the box that pops up.

That last step matters. The app isn't signed with an Apple developer
certificate, so macOS will say it's from an unidentified developer, or
that it's "damaged," if you just double-click. Right-click → Open tells
your Mac you trust it. After that, it opens normally.

If your Mac still refuses, go to **System Settings → Privacy & Security**,
scroll down, and click **Open Anyway** next to the app's name.

### Windows — `Lab-Report-Filler-Windows.zip`

1. Right-click the zip and choose **Extract All**. You get
   **Lab Report Filler.exe**.
2. Put it wherever you like — the Desktop is fine. There's no installer.
3. Double-click it. The first time, Windows shows a blue **"Windows
   protected your PC"** box: click **More info**, then **Run anyway**.

Same reason as the Mac warning — the app isn't signed with a paid
certificate, so SmartScreen doesn't recognise it yet.

### Linux — `Lab-Report-Filler-Linux.tar.gz`

```bash
tar -xzf Lab-Report-Filler-Linux.tar.gz
./lab-report-filler
```

x86-64 only — it will not run on an ARM machine like a Raspberry Pi.

The window itself is drawn by a component that links against your system
GTK and media libraries. On Debian or Ubuntu, if it won't start:

```bash
sudo apt install libgtk-3-0 libmpv2 libsecret-1-0 \
  libgstreamer1.0-0 gstreamer1.0-plugins-base
```

Other distributions want the equivalent GTK 3, mpv and GStreamer
packages. And the first launch needs an internet connection — it
downloads the window component for your distribution and caches it under
`~/.flet/`. Every launch after that works offline.

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
![Filling in the form](docs/Screenshot1.png)
![Filling in the form Continued](docs/Screenshot2.png)


## Using it

Version 2 is one screen: the form below. Version 1 has a second tab with
a scratch calculator, described further down.

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

Tick **Scientific notation** before calculating and that answer prints
as `6.022 × 10²³` instead of `6.022e+23` — the shown work gets rewritten
to match. It's per calculation, so one report can have Avogadro's number
in scientific notation and a density as plain `8 g/mL`.

Built-in calculations: percent error, percent yield, density, moles from
grams, molarity, and average. *Average* works a little differently: you
add one number at a time, each one locks in as a chip, and then you
calculate. That way you can check every value before it goes in.

**Analysis questions** — a question box and an answer box per row.
*Add question* for more.

**Your report** — hit *Generate report* to see a preview, then
**Save as Word** to get a `.docx`. Version 1 also has *Save as .md* for
plain text.

## New in version 2

- One screen instead of tabs — the Trigonometry calculator was removed
- Light and dark themes, with an animated sun/moon switch, and five accent
  colours for the app itself
- A running list of every calculation you've added, each with an × to
  remove it
- Rows, tables and questions slide in and fade out instead of jumping
- Word export: the six themes as before, plus a **Custom** option where
  you pick any colour and the rest is worked out from it — and a check
  that keeps pale colours readable
- Blank table rows you never filled in are left out of the report
- Written in TypeScript with Tauri v2, so the app is a few megabytes
  instead of a few hundred

## Trigonometry tab (version 1 only)

Version 2 does not have this — it is one screen, the lab report form.

A scratch calculator that has nothing to do with your report — work
something out without it ending up in what you turn in.

It does trigonometry, but also logs, roots and powers.

Type a whole expression and press Enter:

```
sin(30) + log(100)          ->  2.5
18.0 / 18.02 * 6.022e23     ->  6.015e+23   (6.015 × 10²³)
sqrt(144) / 2^2             ->  3
```

**Degrees** is on by default, so `sin(30)` is `0.5`. Switch it off for
radians.

Available: `sin cos tan asin acos atan atan2 sinh cosh tanh`, `log ln
log2 exp`, `sqrt cbrt pow hypot`, `abs round floor ceil trunc fmod gcd
factorial degrees radians`. Constants `pi`, `e`, `tau`. Powers as `2^10`
or `2**10`.

**You don't have to type the function names.** Every one of them is a
button under the answer, grouped into trigonometry, logs and powers, and
numbers and brackets. Tap `sin`, type `30`, hit Solve.

**Closing brackets are optional.** `sin(30` and `2*(3+4` both work —
there's only one place a missing bracket can go, so the app puts it
there. Same on the keypad.

**Variables.** `x = 5` stores it, then `x^2 + 1` uses it — and one
variable can be built from another (`y = x * 3`). `ans` is always your
last answer, so `ans / 2` carries on from where you were. Everything
stored shows as a chip under the calculator; click one to type its name.

A name you've already used isn't blocked, but it won't change quietly
either — reusing one says **Replaced x: 5 → 7** and outlines that chip,
so you can see it happened. Built-in names like `pi` and `sin` are
refused outright.

**Degrees.** There's a `°` you can type: `sin(30°)` is `0.5` whichever
way the Degrees switch is set, so one expression can mix the two.

**Roots and fractions.** `√81` works without brackets — so does
`√sin(30)`, where it takes the whole call. Fractions are just division:
`3/4`, `2/3 - 1/6`, `(1/2)^2`.

You can also type `×` `÷` `π` and superscripts like `10²³`, so an
answer copied out of a report pastes straight back in.

Answers over 100,000 or under 0.001 also show in scientific notation.
The last twelve calculations are kept below — click any line to put it
back in the box.

### The quick keypad

On this tab there's a round calculator button in the top-left corner.
Click it and it grows into a keypad — digits, `+ − × ÷`, brackets, `C`
and backspace, plus `√`, `x²`, `^` and `a/b` for fractions. Click the X
to shrink it back.

After pressing `=`, typing a digit starts a new sum and pressing an
operator carries on from the answer, the way a real calculator does.

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
| Custom (version 2) | Pick any colour. The title band, table header, striped rows and calculation boxes are all worked out from it, and a pale colour gets darkened until the text on it is still readable. |

Three toggles sit next to it:

- **Show formulas** — the italic formula line under each calculation
- **Striped data rows** — alternate shading in the table
- **Flag unanswered questions** — prints *(not answered)* where you left
  an answer blank, so you catch it before you submit. Turn it off for a
  clean copy.

## Updating

Version 1 tells you at the top when a new version is out. Click
**Download**, grab the file from the Releases page, and replace the old
app with the new one — same as installing it the first time. Your reports
aren't stored in the app, so nothing is lost.

Version 2 doesn't check for updates yet; watch the Releases page.

Version 1 users get told when 2.0.0 is out, because the check only looks
for the newest release. It is a real newer version — just a different
build, so install it like a fresh app rather than replacing the old one
in place.

## Troubleshooting

**"Lab Report Filler can't be opened" / "is damaged"** (Mac) — see the
macOS steps under Install. Right-click → Open, or *Open Anyway* in
Privacy & Security.

**"Windows protected your PC"** — click **More info**, then **Run
anyway**. Expected on an unsigned app.

**Nothing happens on Linux** — you're probably missing GTK or mpv. See
the Linux install steps. Running it from a terminal shows the real error
rather than failing silently.

**`Permission denied` on Linux** — the executable bit was lost, which
happens if the tarball was unpacked by a tool that drops permissions.
Fix with `chmod +x lab-report-filler`.

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

Version 2.0.0 works end to end: all six calculations, multiple data
tables, the Markdown preview and the Word export, on Mac, Windows and
Linux.

Version 1.2.0 still works and is still downloadable if you want it.

---

## For developers

### Version 2 — TypeScript + Tauri

```bash
git clone https://github.com/Foxie9190/lab-report-filler.git
cd lab-report-filler/tauri
npm install
npm run dev          # the UI in a browser tab, instant reload
npm run tauri dev    # the real desktop window
npm run tauri build  # a .app and .dmg in src-tauri/target/release/bundle
npm test             # the backend tests
```

Layout:

```
tauri/
  index.html            the page shell
  src/
    main.ts             the form and everything you click
    ui.ts               el(), card(), field(), the custom dropdown, animations
    theme.ts            dark / light and the accent colours
    saveFile.ts         the Save dialog and writing the file
    styles.css          all the styling, colours as CSS variables
    backend/
      models.ts         the shared data shapes
      chem.ts           the chemistry math
      report.ts         builds the Markdown preview
      exportDocx.ts     builds the Word document and holds the themes
  src-tauri/            the Rust side: window, plugins, permissions
  test.ts               the backend tests
```

### Version 1 — Python + Flet

The original app, built with [Flet](https://flet.dev):

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

### Releasing a version

Two apps, two workflows, two tag prefixes — so tagging one never
rebuilds the other.

**Version 2 (Tauri)** — bump the number in all four places
(`tauri/package.json`, `tauri/src-tauri/Cargo.toml`,
`tauri/src-tauri/tauri.conf.json`, and `VERSION` in `tauri/src/main.ts`),
commit, then:

```bash
git tag v2.0.1
git push origin v2.0.1
```

`.github/workflows/tauri.yml` builds the Mac, Windows and Linux
installers and puts them in a **draft** Release. Check it over on GitHub,
then press Publish.

**Version 1 (Python)** — bump `VERSION` in `backend/updates.py` and the
version in `pyproject.toml`, commit, then:

```bash
git tag py-v1.2.1
git push origin py-v1.2.1
```

`.github/workflows/build.yml` builds the three Python bundles. Version 1
apps already out there compare their own `VERSION` with the newest
release tag to decide whether to show the update strip, so the numbers
have to match.

### Building by hand

```bash
pip install pyinstaller
flet pack main.py --name "Lab Report Filler" --icon assets/icon.icns --add-data "assets:assets" -y
```

The bundle lands in `dist/`. You can only build for the platform you're
on — GitHub Actions covers the other two. Per-platform differences:

| Platform | `--icon` | `--add-data` separator |
|---|---|---|
| macOS | `assets/icon.icns` | `:` colon |
| Windows | `assets/icon.ico` | `;` semicolon |
| Linux | not supported, omit it | `:` colon |

Getting the separator wrong builds an app that runs but has no assets.

Icons live in `assets/`: `icon.png` is the master, `icon.icns` is for
macOS and `icon.ico` for Windows. Regenerate the last two from the PNG
if you change it.

**A nicer build, once the tooling is set up.** `flet build macos`
compiles a real native app — your own name and icon in the Dock instead
of Flet's, one process, faster startup. It needs Xcode 15+, CocoaPods
1.16+ and Rosetta 2 on Apple Silicon:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
sudo softwareupdate --install-rosetta --agree-to-license
brew install cocoapods
```

`pyproject.toml` already has the `[tool.flet]` settings it reads. Switch
the workflow over once a local `flet build macos` succeeds.

**Port already in use** when running from source in browser mode means
an old copy is still running: `kill $(lsof -ti :8550)`. Desktop mode
picks a free port on its own.
