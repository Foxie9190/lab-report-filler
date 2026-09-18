# Tauri rewrite (in progress)

The TypeScript + Tauri v2 version of the app. The working Flet/Python app
is still in the folder above and still builds — nothing here replaces it
until this one is actually better.

## Run it

```bash
cd tauri
npm install
npm run dev        # just the web page, in a browser, instant reload
```

`npm run dev` is the one to live in while building. It opens the UI in a
browser tab with no Rust involved, so changes appear the moment you save.

```bash
npm run tauri dev  # the real desktop window
```

This needs Rust: `curl https://sh.rustup.rs -sSf | sh` (about 400MB, once).
The first `tauri dev` compiles the Rust shell and takes a few minutes.
After that it's fast.

```bash
npm run check      # typecheck only, no build — run this constantly
npm run build      # typecheck + bundle the web side
npm run tauri build # the shippable .app / .exe
```

## Who writes what

Same split as the Python version.

```
src/backend/     YOURS
  models.ts        the contract — read this first
  chem.ts          the chemistry maths
  report.ts        builds the Markdown preview
  calculator.ts    the expression evaluator
  exportDocx.ts    builds the Word file

src/             the interface
  main.ts          wires the tabs and the form
  ui.ts            card / banner / field helpers
  styles.css       the colours, ported from ui/theme.py

src-tauri/       the Rust shell — you shouldn't need to touch it
```

The two sides only ever talk through the types in `backend/models.ts`.

## Where to start

`src/backend/chem.ts`. `percentError` is written out in full; the other
five throw `NotBuiltYet`. Copy the shape of the first one.

Run `npm run check` after each one. The compiler will catch a bare
`return value;` before you ever run the app — that's the error that took
a whole afternoon in the Python version.
