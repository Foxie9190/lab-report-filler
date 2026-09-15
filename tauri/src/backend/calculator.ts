/**
 * The scientific calculator behind the Trigonometry tab.
 * >>> THIS FILE IS YOURS TO WRITE. <<<
 *
 * You hand it a typed expression like "sin(30) + log(100)" and it hands
 * back a number. Nothing here touches the lab report — it's a scratchpad.
 *
 * READ THIS BEFORE YOU START, because there is one way to write this that
 * is a real security hole:
 *
 *   DO NOT USE eval().  DO NOT USE new Function().
 *
 * Both will happily run whatever the person typed as real code. In a
 * browser that means it can reach fetch, localStorage, the DOM — the lot.
 * "It's only my own chemistry app" is exactly how these get shipped.
 *
 * Write a tiny parser instead. It is less work than it sounds and it is the
 * single most educational thing in this whole project:
 *   1. TOKENISE  - walk the string, produce a list of numbers, operators,
 *                  brackets and function names
 *   2. PARSE     - turn that list into a tree, so 2 + 3 × 4 is 14 not 20
 *                  (look up "recursive descent parser" — it is about 100
 *                  lines and it will click)
 *   3. EVALUATE  - walk the tree and do the maths
 *
 * Anything the tokeniser does not recognise is simply refused. That is the
 * whole defence: an unknown name never gets looked up, so there is nothing
 * to exploit.
 *
 * The Python version in ../../backend/calculator.py does exactly this using
 * Python's own ast module. Read it for the behaviour you are matching —
 * especially the parts that are not obvious:
 *
 *   - degrees mode wraps sin/cos/tan on the way IN and asin/acos/atan on
 *     the way OUT, so sin(30) = 0.5
 *   - `^` means power, `×` `÷` `−` and `π` are accepted as typed
 *   - `√16` works with no brackets at all
 *   - a `°` suffix means degrees in BOTH modes, so sin(30°) = 0.5 either way
 *   - missing closing brackets get filled in; a stray EXTRA `)` is an error
 *   - guards: max length 500, max exponent 1000, max factorial 170
 *   - error messages are written for a person, not a programmer
 */

import { NotBuiltYet } from "./models";

/** Something the person typed doesn't work. The message is for them. */
export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
    Object.setPrototypeOf(this, CalcError.prototype);
  }
}

/**
 * Work out a typed expression.
 *
 * @param expression what the person typed, e.g. "sin(30) + 2^3"
 * @param degrees    true means sin(30) is 0.5; false means radians
 * @param variables  values they stored earlier, e.g. { x: 5 }
 * @throws CalcError with a message written for the person
 */
export function evaluate(
  expression: string,
  degrees = true,
  variables: Record<string, number> = {},
): number {
  throw new NotBuiltYet(
    `The calculator (expression "${expression}", ${degrees ? "degrees" : "radians"}, ` +
      `${Object.keys(variables).length} stored variables)`,
  );
}

/**
 * Handle a line that might be an assignment.
 *
 * "x = 5"  -> [5, "x"]        (store it under x)
 * "2 + 2"  -> [4, null]       (nothing to store)
 *
 * The CALLER owns the variables object — this only reads it and reports
 * what should go in. That separation is why the UI can show a banner when
 * a name gets overwritten.
 */
export function evaluateLine(
  text: string,
  degrees = true,
  variables: Record<string, number> = {},
): [number, string | null] {
  throw new NotBuiltYet(
    `The calculator (line "${text}", ${degrees ? "degrees" : "radians"}, ` +
      `${Object.keys(variables).length} stored variables)`,
  );
}

/** Names that can't be assigned over: constants, functions, and "ans". */
export function reservedNames(degrees = true): Set<string> {
  throw new NotBuiltYet(`Reserved names (${degrees ? "degrees" : "radians"} mode)`);
}

/** Every function name, for the on-screen cheat sheet. */
export function functionNames(degrees = true): string[] {
  throw new NotBuiltYet(`Function names (${degrees ? "degrees" : "radians"} mode)`);
}

/** A readable answer: no float noise, no needless trailing zeros. */
export function formatAnswer(value: number, digits = 10): string {
  throw new NotBuiltYet(`Format answer (value=${value}, digits=${digits})`);
}
