/**
 * The Math tab.
 *
 * A tab with its own tabs inside it, because "maths" isn't one screen: a
 * calculator and a graph want completely different layouts, and more will
 * follow (an equation solver, saved problem sets). Each area is a module
 * handed an empty element to fill; adding one is an import and a line in
 * AREAS, the same trick as CALCULATIONS and THEMES.
 *
 * Everything here runs on the engine in src/backend/math: tokenize ->
 * parse -> evaluate. Nothing calls eval() or new Function(), so nothing
 * typed into this tab can ever run as code.
 */

import { el } from "../ui";
import { newEnv } from "../backend/math/evaluate";
import type { MathEnv } from "../backend/math/evaluate";
import { buildCalculator } from "./calculator";
import { buildGraph } from "./graph";

/**
 * What every area is handed.
 *
 * One `env` for the whole tab, deliberately: a variable set in the
 * calculator should work in the graph, so `a = 2` then `y = a*x^2` does
 * what anyone would expect. Degrees mode lives in there too, so the two
 * screens can't disagree about what sin(90) means.
 */
export interface Shared {
  env: MathEnv;
  /**
   * Run something each time this area becomes visible. The graph needs it:
   * a canvas measured while hidden has no width, and draws nothing.
   */
  whenShown: (run: () => void) => void;
}

export interface MathArea {
  id: string;
  label: string;
  build: (host: HTMLElement, shared: Shared) => void;
}

const AREAS: MathArea[] = [
  { id: "calc", label: "Calculator", build: buildCalculator },
  { id: "graph", label: "Graph", build: buildGraph },
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

let built = false;

/**
 * Fill the Math panel. Called the first time the tab is opened rather than
 * at startup, so a graph nobody has looked at costs nothing.
 */
export function buildMathScreen(): void {
  const host = document.getElementById("math-sections");
  if (!host || built) return;
  built = true;

  const env = newEnv(true);
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
    area.build(body, { env, whenShown: (run) => listeners.push(run) });
  });

  host.replaceChildren(strip, panels);

  const last = remembered(LAST_AREA);
  show(AREAS.some((area) => area.id === last) ? (last as string) : AREAS[0].id);
}
