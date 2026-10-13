/**
 * The Math tab.
 *
 * A tab with its own tabs inside it, because "maths" isn't one screen: a
 * calculator, a solver and a graph want completely different layouts. Each
 * area is a module handed an empty element to fill; adding one is an import
 * and a line in AREAS, the same trick as CALCULATIONS and THEMES.
 *
 * This file also owns the PAGE — the thing that gets saved. The areas write
 * what they do into `shared.page` and call `shared.changed()`; the autosave
 * below does the rest, the same way the Lab report tab works.
 *
 * Everything here runs on the engine in src/backend/math: tokenize ->
 * parse -> evaluate. Nothing calls eval() or new Function(), so nothing
 * typed into this tab can ever run as code.
 */

import { el } from "../ui";
import { newEnv } from "../backend/math/evaluate";
import type { MathEnv } from "../backend/math/evaluate";
import { makeMathPage } from "../backend/math/page";
import type { MathPage } from "../backend/math/page";
import {
  lastMathPageId,
  loadMathPage,
  rememberLastMathPage,
  saveMathPage,
} from "../store";
import { buildCalculator } from "./calculator";
import { buildGraph } from "./graph";
import { buildSolver } from "./solver";
import { buildPages } from "./pages";

/**
 * What every area is handed.
 *
 * One `env` and one `page` for the whole tab, deliberately: a variable set
 * in the calculator should work in the graph, so `a = 2` then `y = a*x^2`
 * does what anyone would expect, and all three areas are saved together.
 */
export interface Shared {
  env: MathEnv;
  page: MathPage;
  /** Call after changing the page. Saving happens shortly after. */
  changed: () => void;
  /** Run something each time this area becomes visible. */
  whenShown: (run: () => void) => void;
  /** Open a saved page, or null for a fresh one. Rebuilds the whole tab. */
  openPage: (id: number | null) => Promise<void>;
  /** Called by the pages list after it deletes whatever is open. */
  currentPageId: () => number | null;
}

export interface MathArea {
  id: string;
  label: string;
  build: (host: HTMLElement, shared: Shared) => void;
}

const AREAS: MathArea[] = [
  { id: "calc", label: "Calculator", build: buildCalculator },
  { id: "solve", label: "Solve", build: buildSolver },
  { id: "graph", label: "Graph", build: buildGraph },
  { id: "pages", label: "Pages", build: buildPages },
];

const LAST_AREA = "labfiller.mathArea";

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal — it just opens on the first area next time.
  }
}

// ---- the page being worked on ----------------------------------------------

let page: MathPage = makeMathPage();
let pageId: number | null = null;
let saveTimer: number | null = null;
let saving = false;
let saveAgain = false;
let setSaveState: (text: string) => void = () => {};
let started = false;

/**
 * Save 600ms after things stop changing.
 *
 * Same reasoning as the lab autosave: writing on every keystroke would hit
 * the database dozens of times a second for no benefit, and writing only on
 * close would lose work whenever something went wrong.
 */
function markChanged(): void {
  setSaveState("Saving…");
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 600);
}

async function saveNow(): Promise<void> {
  if (saving) {
    // A save is already in flight. Remember to go again rather than
    // starting a second one on top of it.
    saveAgain = true;
    return;
  }
  saving = true;
  try {
    pageId = await saveMathPage(page, pageId);
    rememberLastMathPage(pageId);
    setSaveState("Saved");
  } catch (err) {
    console.error("could not save the maths page", err);
    setSaveState("Not saved");
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      markChanged();
    }
  }
}

// ---- the tab ----------------------------------------------------------------

/**
 * Fill the Math panel. Called the first time the tab is opened rather than
 * at startup, so a graph nobody has looked at costs nothing.
 */
export function buildMathScreen(): void {
  if (started) return;
  started = true;
  void openPage(lastMathPageId());
}

/** Load a page (or start a fresh one) and rebuild the tab around it. */
async function openPage(id: number | null): Promise<void> {
  if (id !== null) {
    try {
      const found = await loadMathPage(id);
      if (found === null) {
        // Deleted on another computer, or the database was replaced.
        id = null;
        page = makeMathPage();
      } else {
        page = found;
      }
    } catch (err) {
      console.error("could not open that maths page", err);
      id = null;
      page = makeMathPage();
    }
  } else {
    page = makeMathPage();
  }
  pageId = id;
  rememberLastMathPage(id);
  draw();
}

/** Build the whole tab from the page that's open. */
function draw(): void {
  const host = document.getElementById("math-sections");
  if (!host) return;

  const env = newEnv(page.degrees);
  for (const [name, value] of page.variables) env.variables.set(name, value);

  // ---- the bar above the tabs: what this page is called, and whether it's saved
  const title = el("input", {
    type: "text",
    class: "page-title",
    placeholder: "Name this page",
    "aria-label": "Page name",
  });
  title.value = page.title;
  title.addEventListener("input", () => {
    page.title = title.value;
    markChanged();
  });

  const state = el("span", { class: "save-state" }, ["Saved"]);
  setSaveState = (text) => {
    state.textContent = text;
  };

  const fresh = el("button", { class: "ghost small", type: "button" }, ["New page"]);
  fresh.addEventListener("click", () => {
    // Whatever is open is already saved, so starting a new one loses nothing.
    void openPage(null);
  });

  const bar = el("div", { class: "page-bar" }, [title, state, fresh]);

  // ---- the inner tabs
  const strip = el("div", { class: "subtabs", role: "tablist" });
  const panels = el("div", { class: "subpanels" });

  const buttons: HTMLButtonElement[] = [];
  const bodies: HTMLElement[] = [];
  const shownListeners: (() => void)[][] = [];

  function show(id: string): void {
    AREAS.forEach((area, i) => {
      const on = area.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      bodies[i].hidden = !on;
      if (on) for (const run of shownListeners[i]) run();
    });
    remember(LAST_AREA, id);
  }

  const shared: Shared = {
    env,
    page,
    changed: () => {
      // Variables live in the env while you work; copy them onto the page
      // so they're part of what gets saved.
      page.variables = [...env.variables.entries()].filter(([name]) => name !== "ans");
      page.degrees = env.degrees;
      markChanged();
    },
    whenShown: () => {},
    openPage,
    currentPageId: () => pageId,
  };

  AREAS.forEach((area) => {
    const button = el("button", { class: "subtab", type: "button", role: "tab" }, [area.label]);
    button.addEventListener("click", () => show(area.id));
    buttons.push(button);
    strip.append(button);

    const body = el("div", { class: "subpanel", role: "tabpanel" });
    body.hidden = true;
    bodies.push(body);
    panels.append(body);

    const listeners: (() => void)[] = [];
    shownListeners.push(listeners);
    area.build(body, { ...shared, whenShown: (run) => listeners.push(run) });
  });

  host.replaceChildren(bar, strip, panels);

  const last = remembered(LAST_AREA);
  show(AREAS.some((area) => area.id === last) ? (last as string) : AREAS[0].id);
}
