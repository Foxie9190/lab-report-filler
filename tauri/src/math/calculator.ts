/**
 * The scientific calculator.
 *
 * Laid out like a page of working rather than a pocket calculator: every
 * line you enter stays on screen with its answer under it, so you can see
 * how you got somewhere instead of one number in a window. `ans` is the
 * last answer, and `x = 5` remembers a value for later lines.
 */

import { el } from "../ui";
import { calculate, FUNCTIONS } from "../backend/math/evaluate";
import * as goEngine from "./goEngine";
import type { Shared } from "./mathTab";

/** The buttons under the box. Text that gets typed for you, nothing more. */
const PALETTE: { label: string; insert: string; move?: number }[] = [
  { label: "√", insert: "sqrt()", move: -1 },
  { label: "x²", insert: "^2" },
  { label: "xʸ", insert: "^" },
  { label: "π", insert: "pi" },
  { label: "sin", insert: "sin()", move: -1 },
  { label: "cos", insert: "cos()", move: -1 },
  { label: "tan", insert: "tan()", move: -1 },
  { label: "log", insert: "log()", move: -1 },
  { label: "ln", insert: "ln()", move: -1 },
  { label: "( )", insert: "()", move: -1 },
  { label: "ans", insert: "ans" },
];

/** How an answer should read: enough digits to be useful, not 17 of them. */
function tidy(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toPrecision(12));
  if (Math.abs(rounded) >= 1e10 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
    return rounded.toExponential(6).replace(/e\+?(-?)/, " × 10^");
  }
  return String(rounded);
}

export function buildCalculator(host: HTMLElement, shared: Shared): void {
  const lines = el("div", { class: "calc-lines" });
  const empty = el("p", { class: "calc-empty" }, [
    "Type a sum and press Enter. Try 3 * (4 + 2), sqrt(16), sin(30), or x = 5.",
  ]);
  lines.append(empty);

  const input = el("input", {
    type: "text",
    class: "calc-input",
    placeholder: "2 + 3 * 4",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Expression",
  });

  const angles = el("button", { class: "chip-toggle", type: "button" }, ["Degrees"]);
  angles.addEventListener("click", () => {
    shared.env.degrees = !shared.env.degrees;
    angles.textContent = shared.env.degrees ? "Degrees" : "Radians";
    shared.changed();
  });

  const clear = el("button", { class: "ghost small", type: "button" }, ["Clear"]);
  clear.addEventListener("click", () => {
    lines.replaceChildren(empty);
    // Clear means clear: the saved page loses these lines as well, or they
    // would reappear the next time the page was opened.
    shared.page.lines = shared.page.lines.filter((line) => line.kind !== "calc");
    shared.changed();
    input.focus();
  });

  /** Put text into the box where the cursor is, not at the end. */
  function insert(text: string, move = 0): void {
    const at = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? at;
    input.value = input.value.slice(0, at) + text + input.value.slice(end);
    const caret = at + text.length + move;
    input.setSelectionRange(caret, caret);
    input.focus();
  }

  const palette = el("div", { class: "palette" });
  for (const key of PALETTE) {
    const button = el("button", { class: "key", type: "button" }, [key.label]);
    button.addEventListener("click", () => insert(key.insert, key.move ?? 0));
    palette.append(button);
  }

  /** The line of variables under the box, so nothing is secretly set. */
  const vars = el("div", { class: "calc-vars" });
  function showVariables(): void {
    const named = [...shared.env.variables.entries()].filter(([name]) => name !== "ans");
    vars.replaceChildren();
    if (named.length === 0) {
      vars.hidden = true;
      return;
    }
    vars.hidden = false;
    vars.append(el("span", { class: "calc-vars-label" }, ["Set:"]));
    for (const [name, value] of named) {
      const chip = el("button", { class: "chip", type: "button", title: `Forget ${name}` }, [
        `${name} = ${tidy(value)}`,
        el("span", { class: "chip-x" }, ["×"]),
      ]);
      chip.addEventListener("click", () => {
        shared.env.variables.delete(name);
        showVariables();
        shared.changed();
      });
      vars.append(chip);
    }
  }

  /** Put one worked line on screen. Used by a fresh run and by a reopened page. */
  function addLine(asked: string, answer: string, worked: boolean): void {
    const line = el("div", { class: "calc-line" }, [
      el("div", { class: "calc-asked" }, [asked]),
      el("div", { class: "calc-answer" }, [answer]),
    ]);
    if (!worked) line.classList.add("bad");
    if (lines.contains(empty)) lines.replaceChildren();
    lines.append(line);
    // Newest at the bottom, like working down a page.
    lines.scrollTop = lines.scrollHeight;
  }

  function run(): void {
    const text = input.value.trim();
    if (text === "") return;

    let answer: string;
    let worked = true;
    /*
     * The Go engine when it's loaded, the TypeScript one when it isn't.
     *
     * Both answer the same question and both keep the variables; the only
     * difference is which language worked it out. goEngine.ready() is null
     * until math.wasm has loaded, and stays null if it never does.
     */
    const go = goEngine.ready();
    if (go !== null) {
      const result = go.calculate(text, shared.env.degrees, shared.env.variables);
      if (result.ok && result.value !== undefined) {
        answer = `= ${tidy(result.value)}`;
        // Go hands the variables back rather than holding them, so `x = 5`
        // and `ans` land in the one copy that lives here.
        for (const [name, value] of Object.entries(result.variables ?? {})) {
          shared.env.variables.set(name, value);
        }
      } else {
        answer = result.error ?? "that didn't work out";
        worked = false;
      }
    } else {
      try {
        answer = `= ${tidy(calculate(text, shared.env))}`;
      } catch (err) {
        answer = (err as Error).message;
        worked = false;
      }
    }

    addLine(text, answer, worked);
    // Onto the page, so it's still here tomorrow.
    shared.page.lines.push({ kind: "calc", input: text, output: answer, ok: worked });
    shared.changed();

    input.value = "";
    showVariables();
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
    // Up arrow brings back what you typed last — every calculator should.
    if (event.key === "ArrowUp" && input.value === "") {
      const asked = lines.querySelectorAll(".calc-asked");
      const last = asked[asked.length - 1];
      if (last) {
        input.value = last.textContent ?? "";
        event.preventDefault();
      }
    }
  });

  const equals = el("button", { class: "primary", type: "button" }, ["="]);
  equals.addEventListener("click", run);

  const box = el("section", { class: "card calc-card" }, [
    el("div", { class: "calc-head" }, [el("h2", {}, ["Calculator"]), angles, clear]),
    lines,
    vars,
    el("div", { class: "calc-entry" }, [input, equals]),
    palette,
    el("p", { class: "subtitle calc-help" }, [
      `Functions: ${Object.keys(FUNCTIONS).join(", ")}. Constants: pi, e. ` +
        "Set a value with x = 5, and ans is the last answer.",
    ]),
  ]);

  host.append(box);

  // Whatever was on this page when it was last open.
  for (const line of shared.page.lines) {
    if (line.kind === "calc") addLine(line.input, line.output, line.ok);
  }

  shared.whenShown(() => {
    angles.textContent = shared.env.degrees ? "Degrees" : "Radians";
    showVariables();
  });
}
