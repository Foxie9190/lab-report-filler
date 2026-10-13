/**
 * The Solve area: type an equation, get the steps.
 *
 * All the thinking lives in backend/math/solve.ts. This is the screen: it
 * splits the line at the `=`, works out which letter is the unknown, and
 * lays the working out the way it would be written on paper.
 */

import { el } from "../ui";
import { parse } from "../backend/math/parse";
import type { Node } from "../backend/math/parse";
import { solve } from "../backend/math/solve";
import type { Shared } from "./mathTab";

const EXAMPLES = ["3x + 7 = 22", "2(x - 3) = x + 1", "x/4 + 1 = 3", "5 = 2x - 1"];

/**
 * Every plain letter used in a tree.
 *
 * Only `name` nodes count, so `sin(30)` contributes nothing — a function's
 * name lives on a `call` node. Constants are left out too: `2pi = x` is
 * solving for x, not for pi.
 */
const CONSTANT_NAMES = new Set(["pi", "e", "ans"]);

function namesIn(node: Node, found: Set<string>): Set<string> {
  switch (node.kind) {
    case "name":
      if (!CONSTANT_NAMES.has(node.text)) found.add(node.text);
      break;
    case "unary":
      namesIn(node.value, found);
      break;
    case "binary":
      namesIn(node.left, found);
      namesIn(node.right, found);
      break;
    case "call":
      for (const arg of node.args) namesIn(arg, found);
      break;
    case "number":
      break;
  }
  return found;
}

/** A number as a person would write it: 5, 2.5, -4.5, not 2.4999999999. */
function tidy(value: number): string {
  const rounded = Number(value.toPrecision(12));
  if (Number.isInteger(rounded)) return String(rounded);
  // Thirds and sevenths read better as fractions than as 0.333333333333.
  for (let bottom = 2; bottom <= 12; bottom++) {
    const top = rounded * bottom;
    if (Math.abs(top - Math.round(top)) < 1e-9) {
      return `${Math.round(top)}/${bottom}  (${rounded})`;
    }
  }
  return String(rounded);
}

/** How a solved equation is kept on the page. */
interface SavedSolution {
  steps: string[];
  variable: string;
  value: number;
}

/** Read one back, or null if it isn't one. */
function readSolution(text: string): SavedSolution | null {
  try {
    const parsed = JSON.parse(text) as Partial<SavedSolution>;
    if (!Array.isArray(parsed.steps) || typeof parsed.variable !== "string") return null;
    return {
      steps: parsed.steps,
      variable: parsed.variable,
      value: typeof parsed.value === "number" ? parsed.value : NaN,
    };
  } catch {
    return null;
  }
}

export function buildSolver(host: HTMLElement, shared: Shared): void {
  const input = el("input", {
    type: "text",
    class: "calc-input",
    placeholder: "3x + 7 = 22",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Equation",
  });

  const forWhat = el("input", {
    type: "text",
    class: "solve-for",
    placeholder: "x",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Solve for",
  });

  const go = el("button", { class: "primary", type: "button" }, ["Solve"]);
  const working = el("div", { class: "calc-lines" });
  const hint = el("p", { class: "calc-empty" }, [
    "Type an equation and press Enter. One unknown, not squared — like 3x + 7 = 22.",
  ]);
  working.append(hint);

  /** Lay one solved equation out: the question, the moves, the answer. */
  function show(equation: string, steps: string[], variable: string, value: number): void {
    const block = el("div", { class: "solve-block" }, [
      el("div", { class: "calc-asked" }, [equation]),
    ]);

    const list = el("ol", { class: "solve-steps" });
    // The first step is just the equation tidied up, which the heading above
    // already says — so it's shown as the starting point, not as a move.
    for (const step of steps.slice(1)) {
      const at = step.indexOf(":  ");
      if (at === -1) {
        list.append(el("li", {}, [step]));
        continue;
      }
      list.append(
        el("li", {}, [
          el("span", { class: "solve-move" }, [step.slice(0, at)]),
          el("span", { class: "solve-result" }, [step.slice(at + 3)]),
        ]),
      );
    }
    block.append(list);
    block.append(el("div", { class: "solve-answer" }, [`${variable} = ${tidy(value)}`]));

    if (working.contains(hint)) working.replaceChildren();
    working.append(block);
    working.scrollTop = working.scrollHeight;
  }

  /** An equation that couldn't be solved, and why. */
  function showRefused(equation: string, message: string): void {
    const block = el("div", { class: "solve-block bad" }, [
      el("div", { class: "calc-asked" }, [equation]),
      el("div", { class: "solve-answer" }, [message]),
    ]);
    if (working.contains(hint)) working.replaceChildren();
    working.append(block);
    working.scrollTop = working.scrollHeight;
  }

  function run(): void {
    const text = input.value.trim();
    if (text === "") return;

    try {
      const at = text.indexOf("=");
      if (at === -1) throw new Error("An equation needs an = in it");
      if (text.indexOf("=", at + 1) !== -1) throw new Error("Only one = , please");

      const left = parse(text.slice(0, at));
      const right = parse(text.slice(at + 1));

      // Which letter are we solving for? Whatever the person typed, or the
      // only letter in the equation.
      const asked = forWhat.value.trim();
      const found = [...namesIn(left, namesIn(right, new Set<string>()))];
      let variable = asked;
      if (variable === "") {
        if (found.length === 0) throw new Error("There's no letter here to solve for");
        if (found.length > 1) {
          throw new Error(`Which one should I solve for — ${found.join(" or ")}?`);
        }
        variable = found[0];
      }

      const answer = solve(left, right, variable, shared.env);
      show(text, answer.steps, answer.variable, answer.value);

      // Onto the page, as JSON rather than as text. The working is what
      // matters here, and picking the answer back out of a printed step
      // would mean parsing our own output — which breaks the moment the
      // wording changes.
      shared.page.lines.push({
        kind: "solve",
        input: text,
        output: JSON.stringify({
          steps: answer.steps,
          variable: answer.variable,
          value: answer.value,
        } satisfies SavedSolution),
        ok: true,
      });

      // Remember it, so the next line can use it and the graph can draw it.
      shared.env.variables.set(answer.variable, answer.value);
      shared.changed();
      input.value = "";
    } catch (err) {
      const message = (err as Error).message;
      showRefused(text, message);
      shared.page.lines.push({ kind: "solve", input: text, output: message, ok: false });
      shared.changed();
    }
  }

  go.addEventListener("click", run);
  for (const box of [input, forWhat]) {
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        run();
      }
    });
  }

  const clear = el("button", { class: "ghost small", type: "button" }, ["Clear"]);
  clear.addEventListener("click", () => {
    working.replaceChildren(hint);
    shared.page.lines = shared.page.lines.filter((line) => line.kind !== "solve");
    shared.changed();
    input.focus();
  });

  const examples = el("div", { class: "palette" });
  for (const example of EXAMPLES) {
    const button = el("button", { class: "key", type: "button" }, [example]);
    button.addEventListener("click", () => {
      input.value = example;
      run();
    });
    examples.append(button);
  }

  host.append(
    el("section", { class: "card" }, [
      el("div", { class: "calc-head" }, [el("h2", {}, ["Solve"]), clear]),
      working,
      el("div", { class: "calc-entry" }, [
        input,
        el("label", { class: "solve-for-wrap" }, [el("span", {}, ["for"]), forWhat]),
        go,
      ]),
      examples,
      el("p", { class: "subtitle" }, [
        "One unknown, and it can't be squared or inside a function. The answer " +
          "is remembered afterwards, so you can use it in the calculator or draw it.",
      ]),
    ]),
  );

  // Whatever was solved on this page when it was last open. The working is
  // put back as it was rather than solved again: what you see is what you
  // handed in, even if the solver changes later.
  for (const line of shared.page.lines) {
    if (line.kind !== "solve") continue;
    if (!line.ok) {
      showRefused(line.input, line.output);
      continue;
    }
    const saved = readSolution(line.output);
    if (saved === null) continue; // written by something older; skip it quietly
    show(line.input, saved.steps, saved.variable, saved.value);
  }

  shared.whenShown(() => input.focus());
}
