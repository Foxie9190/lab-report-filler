/**
 * The chemistry maths.  >>> THIS FILE IS YOURS TO WRITE. <<<
 *
 * The rule is the same as the Python version: every function takes plain
 * numbers and returns a CalcResult. Nothing in here touches the UI, and the
 * UI never reaches in here for anything except CALCULATIONS below.
 *
 * HOW TO WRITE ONE — the three steps, same as before:
 *   1. guard the denominator (never divide by zero)
 *   2. work out the number
 *   3. wrap it in a CalcResult and return that — NOT the bare number
 *
 * Step 3 is the one that bit you in Python ("'float' object has no
 * attribute 'name'"). Returning a bare number compiles fine in Python and
 * blows up at runtime. In TypeScript it will not even compile — the red
 * squiggle appears as you type. That is the whole point of TS.
 */

import type { CalcResult } from "./models";
import { NotBuiltYet } from "./models";

/**
 * percentError(9.5, 10) -> 5 %
 *
 * Worked example, fully written, to copy the shape from.
 * Note `: CalcResult` after the brackets — that is the return type, and it
 * is what makes TS catch a bare `return answer;`.
 */
export function percentError(experimental: number, accepted: number): CalcResult {
  if (accepted === 0) {
    throw new Error("Accepted value can't be 0 — you'd be dividing by zero.");
  }
  const value = (Math.abs(experimental - accepted) / Math.abs(accepted)) * 100;
  return {
    name: "Percent Error",
    formula: "|experimental − accepted| / accepted × 100",
    value,
    unit: "%",
    work: `|${experimental} − ${accepted}| / ${accepted} × 100 = ${value.toFixed(2)}%`,
  };
}

/** percentYield(4, 5) -> 80 %.  Remember the × 100. */
export function percentYield(actual: number, theoretical: number): CalcResult {
  throw new NotBuiltYet(`Percent yield (actual=${actual}, theoretical=${theoretical})`);
}

/** density(10, 5) -> 2 g/mL.  Guard volume, not mass. */
export function density(mass: number, volume: number): CalcResult {
  throw new NotBuiltYet(`Density (mass=${mass}, volume=${volume})`);
}

/** molesFromGrams(18, 18) -> 1 mol.  Guard molar mass. */
export function molesFromGrams(grams: number, molarMass: number): CalcResult {
  throw new NotBuiltYet(`Moles from grams (grams=${grams}, molarMass=${molarMass})`);
}

/** molarity(0.5, 2) -> 0.25 M.  Guard litres — and guard BEFORE you divide. */
export function molarity(moles: number, liters: number): CalcResult {
  throw new NotBuiltYet(`Molarity (moles=${moles}, liters=${liters})`);
}

/**
 * average([1, 2, 6]) -> 3
 *
 * Takes a LIST, not two numbers — the UI collects values one at a time and
 * hands you all of them at once. Guard the empty list or you divide by zero.
 */
export function average(values: number[]): CalcResult {
  throw new NotBuiltYet(`Average (${values.length} values)`);
}

/**
 * The menu the UI builds its dropdown from.
 *
 * Add a line here and the calculation appears in the app — no UI change
 * needed. `fields` are the input box labels, and `run` receives those
 * boxes' numbers in the same order.
 *
 * TYPESCRIPT NOTE: `Calculation` below describes one entry. `run` has two
 * possible shapes because `average` takes a list while the rest take two
 * numbers, and `listInput: true` is how the UI knows which is which.
 */
export interface Calculation {
  label: string;
  fields: string[];
  listInput?: boolean;
  run: (...args: number[]) => CalcResult;
  runList?: (values: number[]) => CalcResult;
}

export const CALCULATIONS: Record<string, Calculation> = {
  percentError: {
    label: "Percent Error",
    fields: ["Experimental value", "Accepted value"],
    run: (a, b) => percentError(a, b),
  },
  percentYield: {
    label: "Percent Yield",
    fields: ["Actual yield (g)", "Theoretical yield (g)"],
    run: (a, b) => percentYield(a, b),
  },
  density: {
    label: "Density",
    fields: ["Mass (g)", "Volume (mL)"],
    run: (a, b) => density(a, b),
  },
  molesFromGrams: {
    label: "Moles from Grams",
    fields: ["Mass (g)", "Molar mass (g/mol)"],
    run: (a, b) => molesFromGrams(a, b),
  },
  molarity: {
    label: "Molarity",
    fields: ["Moles of solute", "Liters of solution"],
    run: (a, b) => molarity(a, b),
  },
  average: {
    label: "Average",
    fields: ["Value"],
    listInput: true,
    run: (...values) => average(values),
    runList: (values) => average(values),
  },
};
