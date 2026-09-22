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
import { formatSignificant } from "./models";

/**
 * percentError(9.5, 10) -> 5 %
 *
 * Worked example, fully written, to copy the shape from.
 * Note `: CalcResult` after the brackets — that is the return type, and it
 * is what makes TS catch a bare `return answer;`.
 */
export function percentError(
  experimental: number,
  accepted: number,
): CalcResult {
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
  if (theoretical === 0) {
    throw new Error("Theoretical Can Not Be Zero");
  }
  const value = (actual / theoretical) * 100;

  return {
    name: "Precent Yield",
    formula: "Actual ÷ Theorietical",
    value: value,
    unit: "%",
    work: `${actual} ÷ ${theoretical} = ${formatSignificant(value, 4)}`,
  };
}

/** density(10, 5) -> 2 g/mL.  Guard volume, not mass. */
export function density(mass: number, volume: number): CalcResult {
  if (volume === 0) {
    throw new Error("Cant Have A Volume Of Zero");
  }
  const value = mass / volume;
  return {
    name: "Density",
    formula: "Mass ÷ Volume",
    value: value,
    unit: "g/mL",
    work: `${mass} ÷ ${volume} = ${formatSignificant(value, 4)}`,
  };
}

/** molesFromGrams(18, 18) -> 1 mol.  Guard molar mass. */
export function molesFromGrams(grams: number, molarMass: number): CalcResult {
  if (molarMass === 0) {
    throw new Error("Cannot Divide By Zero");
  }
  const value = grams / molarMass;

  return {
    name: "Moles From Grames",
    formula: "Grams ÷ Molar Mass",
    value: value,
    unit: "mol",
    work: `${grams} ÷ ${molarMass} = ${formatSignificant(value, 4)}`,
  };
  // throw new NotBuiltYet(`Moles from grams (grams=${grams}, molarMass=${molarMass})`);
}

/** molarity(0.5, 2) -> 0.25 M.  Guard litres — and guard BEFORE you divide. */
export function molarity(moles: number, liters: number): CalcResult {
  if (liters === 0) {
    throw new Error("Cannot Divide By Zero");
  }
  const value = moles / liters;
  return {
    name: "Molarity",
    formula: "Moles ÷ Liters",
    value: value,
    unit: "M",
    work: `${moles} ÷ ${liters} = ${formatSignificant(value, 4)}`,
  };
}

/**
 * average([1, 2, 6]) -> 3
 *
 * Takes a LIST, not two numbers — the UI collects values one at a time and
 * hands you all of them at once. Guard the empty list or you divide by zero.
 */
export function average(values: number[]): CalcResult {
  if (values.length === 0) {
    throw new Error("List Can Not Be Empty");
  }
  let number = 0;
  for (const num of values) {
    number += num;
  }
  const value = number / values.length;
  const shown = values.map((v) => formatSignificant(v)).join(" + ");
  return {
    name: "Average",
    formula: "All Numbers Added Up then divided my the amount of numbers",
    value: value,
    unit: "",
    work: `(${shown}) / ${values.length} = ${formatSignificant(value)}`,
  };
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
/**
 * One unit the answer can be shown in. `factor` converts FROM the unit the
 * function returns (always the first in the list) TO this one — so for
 * density, g/mL is 1 and kg/m³ is 1000, because 1 g/mL = 1000 kg/m³.
 */
export interface Unit {
  label: string;
  factor: number;
}

export interface Calculation {
  label: string;
  fields: string[];
  /** First entry is the unit the function itself returns. */
  units: Unit[];
  listInput?: boolean;
  run: (...args: number[]) => CalcResult;
  runList?: (values: number[]) => CalcResult;
}

export const CALCULATIONS: Record<string, Calculation> = {
  percentError: {
    label: "Percent Error",
    fields: ["Experimental value", "Accepted value"],
    units: [{ label: "%", factor: 1 }],
    run: (a, b) => percentError(a, b),
  },
  percentYield: {
    label: "Percent Yield",
    fields: ["Actual yield (g)", "Theoretical yield (g)"],
    units: [{ label: "%", factor: 1 }],
    run: (a, b) => percentYield(a, b),
  },
  density: {
    label: "Density",
    fields: ["Mass (g)", "Volume (mL)"],
    units: [
      { label: "g/mL", factor: 1 },
      { label: "g/cm\u00b3", factor: 1 },
      { label: "kg/L", factor: 1 },
      { label: "kg/m\u00b3", factor: 1000 },
    ],
    run: (a, b) => density(a, b),
  },
  molesFromGrams: {
    label: "Moles from Grams",
    fields: ["Mass (g)", "Molar mass (g/mol)"],
    units: [
      { label: "mol", factor: 1 },
      { label: "mmol", factor: 1000 },
    ],
    run: (a, b) => molesFromGrams(a, b),
  },
  molarity: {
    label: "Molarity",
    fields: ["Moles of solute", "Liters of solution"],
    units: [
      { label: "M", factor: 1 },
      { label: "mol/L", factor: 1 },
      { label: "mM", factor: 1000 },
    ],
    run: (a, b) => molarity(a, b),
  },
  average: {
    label: "Average",
    fields: ["Value"],
    units: [
      { label: "", factor: 1 },
      { label: "g", factor: 1 },
      { label: "mL", factor: 1 },
      { label: "L", factor: 1 },
      { label: "cm", factor: 1 },
      { label: "s", factor: 1 },
      { label: "\u00b0C", factor: 1 },
    ],
    listInput: true,
    run: (...values) => average(values),
    runList: (values) => average(values),
  },
};
