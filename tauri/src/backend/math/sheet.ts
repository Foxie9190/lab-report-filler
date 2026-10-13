/**
 * A page of maths, as a printable sheet.
 *
 * This file produces BLOCKS — the same list of blocks a lab report produces.
 * It never touches Word, never touches HTML. Both renderers already know how
 * to draw a block, so a sheet gets the .docx and the page preview without a
 * line of code in either.
 *
 *   MathPage ──► buildMathSheet() ──► Block[] ──┬──► docx renderer ──► .docx
 *                                               └──► html renderer ──► preview
 */

import type { Block } from "../models";
import { evaluate } from "./evaluate";
import { newEnv } from "./evaluate";
import { parse } from "./parse";
import type { MathPage } from "./page";

/** Whose sheet it is. Printed under the title. */
export interface SheetWho {
  name: string;
  course: string;
  /** Left blank for today's date. */
  date?: string;
}

/** How wide the table of values goes, and in what steps. */
export interface SheetOptions {
  from: number;
  to: number;
  step: number;
  /** Include a table of values under each graphed line. */
  tables: boolean;
}

export function defaultSheetOptions(): SheetOptions {
  return { from: -5, to: 5, step: 1, tables: true };
}

/** A solved equation, as it was saved by the Solve screen. */
interface SavedSolution {
  steps: string[];
  variable: string;
  value: number;
}

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

/** A number as it should be read, not as a computer stores it. */
function tidy(value: number): string {
  const rounded = Number(value.toPrecision(10));
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/** Today, as "14 October 2026". */
function today(): string {
  return new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The sheet, top to bottom.
 *
 * Only solved equations and graphs go on it. The calculator's scratch
 * working stays in the app — a sheet to hand in is the problems and their
 * answers, not every sum you tried on the way.
 */
/** A drawn graph to put on the sheet, made by math/graphImage.ts. */
export interface SheetPicture {
  data: Uint8Array;
  width: number;
  height: number;
}

export function buildMathSheet(
  page: MathPage,
  who: SheetWho,
  options: SheetOptions = defaultSheetOptions(),
  picture: SheetPicture | null = null,
): Block[] {
  const blocks: Block[] = [];

  blocks.push({ kind: "title", text: page.title.trim() || "Maths" });

  const line = [who.name, who.course, who.date?.trim() || today()]
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (line.length > 0) blocks.push({ kind: "byline", text: line.join(" | ") });

  // ---- the problems --------------------------------------------------------
  // Numbered like analysis questions: the equation as the question, the moves
  // as the answer underneath. Equations the solver refused are left out —
  // they were never finished, so they aren't work to hand in.
  const solved = page.lines
    .filter((entry) => entry.kind === "solve" && entry.ok)
    .map((entry) => ({ input: entry.input, solution: readSolution(entry.output) }))
    .filter((entry) => entry.solution !== null);

  if (solved.length > 0) {
    blocks.push({ kind: "heading", text: "Problems" });
    solved.forEach((entry, at) => {
      const solution = entry.solution as SavedSolution;
      // The first step is the equation tidied up, which is already the
      // question — so the working starts from the second.
      const working = solution.steps.slice(1);
      blocks.push({
        kind: "question",
        number: at + 1,
        question: entry.input,
        answer: [...working, `${solution.variable} = ${tidy(solution.value)}`],
        unanswered: false,
      });
    });
  }

  // ---- the graphs ----------------------------------------------------------
  const drawn = page.curves.filter((curve) => curve.text.trim() !== "");
  if (drawn.length > 0) {
    blocks.push({ kind: "heading", text: "Graphs" });

    // The picture first, then the lines it shows, then their values. Drawing
    // happens in the UI layer — it needs a canvas, which this file (plain
    // data in, blocks out) deliberately knows nothing about.
    if (picture !== null) {
      blocks.push({
        kind: "image",
        data: picture.data,
        width: picture.width,
        height: picture.height,
        alt: `A graph of ${drawn.map((curve) => `y = ${curve.text.trim()}`).join(", ")}`,
      });
    }

    for (const curve of drawn) {
      const text = curve.text.trim();
      blocks.push({ kind: "caption", text: `y = ${text}` });

      if (!options.tables) continue;

      // A table of values: the same engine that draws the curve, asked for
      // one y per x. An x where the maths has no answer prints a dash rather
      // than a wrong number — sqrt(-1) has no place on a homework table.
      const env = newEnv(page.degrees);
      for (const [name, value] of page.variables) env.variables.set(name, value);

      let tree;
      try {
        tree = parse(text);
      } catch {
        continue; // an unfinished line being typed; nothing to tabulate
      }

      const xs: number[] = [];
      const step = options.step > 0 ? options.step : 1;
      for (let x = options.from; x <= options.to + step / 1000; x += step) {
        xs.push(Number(x.toPrecision(12)));
      }

      const ys = xs.map((x) => {
        env.variables.set("x", x);
        try {
          const y = evaluate(tree, env);
          return Number.isFinite(y) ? tidy(y) : "—";
        } catch {
          return "—";
        }
      });

      blocks.push({
        kind: "table",
        headers: ["x", "y"],
        rows: xs.map((x, at) => [tidy(x), ys[at]]),
      });
      blocks.push({ kind: "gap" });
    }
  }

  return blocks;
}
