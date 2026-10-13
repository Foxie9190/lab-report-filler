/**
 * A page of maths: what gets kept when you close the app.
 *
 * Deliberately one shape for all three areas. A page holds the lines you
 * worked (whether they came from the calculator or the solver), the curves
 * on the graph, and the state around them — degrees mode and any variables
 * you set. That way "open a page" restores the whole tab at once, rather
 * than three screens each remembering their own half.
 */

/** One worked line. */
export interface MathLine {
  /** Which area it came from, so it goes back where it belongs. */
  kind: "calc" | "solve";
  /** Exactly what was typed. */
  input: string;
  /** The answer, or the steps of a solution joined by newlines. */
  output: string;
  /** False when it was an error, so it comes back red. */
  ok: boolean;
}

/** One curve on the graph. */
export interface MathCurve {
  text: string;
}

export interface MathPage {
  title: string;
  degrees: boolean;
  /** Variables the person set, as plain pairs so they survive JSON. */
  variables: [string, number][];
  lines: MathLine[];
  curves: MathCurve[];
}

/** What the saved list shows for each page. */
export interface MathPageSummary {
  id: number;
  title: string;
  /** The first thing worked on the page, for a page with no name. */
  preview: string;
  lineCount: number;
  updatedAt: string;
}

export function makeMathPage(): MathPage {
  return {
    title: "",
    degrees: true,
    variables: [],
    lines: [],
    curves: [{ text: "x^2 - 3" }],
  };
}

/**
 * What to call a page in a list.
 *
 * Its name if it has one, otherwise the first thing worked on it — someone
 * looking at a list a week later recognises `3x + 7 = 22` and doesn't
 * recognise `Untitled page`.
 */
export function pageLabel(title: string, preview: string): string {
  if (title.trim() !== "") return title.trim();
  if (preview.trim() !== "") return preview.trim().slice(0, 44);
  return "Empty page";
}
