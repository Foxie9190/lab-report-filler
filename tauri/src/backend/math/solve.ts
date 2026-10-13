/**
 * Solving an equation, with the working shown.
 *
 * Only straight-line (linear) equations: one unknown, never multiplied by
 * itself, never inside a function. That covers nearly everything a
 * chemistry or algebra homework asks, and it refuses clearly rather than
 * guessing at the rest.
 *
 * THE IDEA. However it's written, each side of a linear equation is really
 * just `a * x + b`:
 *
 *     3x + 7 = 22        left  a=3, b=7     right a=0, b=22
 *     5 = 2x - 1         left  a=0, b=5     right a=2, b=-1
 *
 * Collect those four numbers and the answer falls out:
 *
 *     a1*x + b1 = a2*x + b2
 *     (a1 - a2) * x = b2 - b1
 *     x = (b2 - b1) / (a1 - a2)
 *
 * The steps printed for the person are that same arithmetic, narrated.
 */

import { evaluate } from "./evaluate";
import type { MathEnv } from "./evaluate";
import type { Node } from "./parse";

/** One side of an equation, boiled down to `a * x + b`. */
export interface Linear {
  a: number;
  b: number;
}

/** What solving gives back. */
export interface Solution {
  variable: string;
  value: number;
  /** One line per move, in the order they were made. */
  steps: string[];
}

export function mentions(node: Node, name: string): boolean {
  switch (node.kind) {
    case "number":
      return false;
    case "name":
      return node.text === name;
    case "unary":
      return mentions(node.value, name);
    case "binary":
      return mentions(node.left, name) || mentions(node.right, name);
    case "call":
      return node.args.some((arg) => mentions(arg, name));
  }
}

export function linear(node: Node, name: string, env: MathEnv): Linear {
  if (!mentions(node, name)) return { a: 0, b: evaluate(node, env) };
  switch (node.kind) {
    case "name":
      return { a: 1, b: 0 };
    case "unary": {
      const inside = linear(node.value, name, env);
      return { a: -inside.a, b: -inside.b };
    }
    case "binary": {
      const left = linear(node.left, name, env);
      const right = linear(node.right, name, env);
      if (node.op === "+") {
        return { a: left.a + right.a, b: right.b + left.b };
      }
      if (node.op === "-") {
        return { a: left.a - right.a, b: left.b - right.b };
      }
      if (node.op === "*") {
        if (left.a === 0) {
          return { a: right.a * left.b, b: right.b * left.b };
        }
        if (right.a === 0) {
          return { a: left.a * right.b, b: left.b * right.b };
        }
        throw new Error(`I can't solve this — ${name} is multiplied by itself`);
      }
      if (node.op === "/") {
        if (right.a !== 0) {
          throw new Error(
            `I can't solve this — ${name} is on the bottom of a fraction`,
          );
        }
        return { a: left.a / right.b, b: left.b / right.b };

      }
      throw new Error(`I can't solve this — ${name} is inside a power`);
    }
  }
  throw new Error(`I can't solve this — ${name} is inside a function`);
}

/** `a * x + b` written the way a person would: 3x + 7, x - 2, 5. */
/** Trim floating-point dust: 0.30000000000000004 -> 0.3 */
function round(value: number): number {
  return Number(value.toPrecision(12));
}

/** "x" rather than "1x", which is how nobody writes it. */
function times(count: number, name: string): string {
  const n = round(Math.abs(count));
  return n === 1 ? name : `${n}${name}`;
}

export function side(form: Linear, name: string): string {
  const a = round(form.a);
  const b = round(form.b);
  if (a === 0) return String(b);
  const term = a === 1 ? name : a === -1 ? `-${name}` : `${a}${name}`;
  if (b === 0) return term;
  return b > 0 ? `${term} + ${b}` : `${term} - ${Math.abs(b)}`;
}

/**
 * Solve, and write down how.
 *
 * Written for you — it's the narration, and it leans entirely on your
 * linear() for the actual work.
 */
export function solve(
  left: Node,
  right: Node,
  name: string,
  env: MathEnv,
): Solution {
  const l = linear(left, name, env);
  const r = linear(right, name, env);
  const steps: string[] = [`${side(l, name)} = ${side(r, name)}`];

  // Everything with an x on the left, everything without on the right.
  if (r.a !== 0) {
    const move = r.a;
    l.a -= move;
    r.a -= move;
    steps.push(
      `${move > 0 ? "Subtract" : "Add"} ${times(move, name)} ${move > 0 ? "from" : "to"} both sides:  ${side(l, name)} = ${side(r, name)}`,
    );
  }
  if (l.b !== 0) {
    const move = l.b;
    l.b -= move;
    r.b -= move;
    steps.push(
      `${move > 0 ? "Subtract" : "Add"} ${round(Math.abs(move))} ${move > 0 ? "from" : "to"} both sides:  ${side(l, name)} = ${side(r, name)}`,
    );
  }

  if (l.a === 0) {
    // No x left. Either every number works, or none does.
    if (r.b === 0)
      throw new Error(`Any value of ${name} works — that's always true`);
    throw new Error(
      `No value of ${name} works — the two sides can never match`,
    );
  }

  if (l.a !== 1) {
    steps.push(
      `Divide both sides by ${round(l.a)}:  ${name} = ${round(r.b / l.a)}`,
    );
  }

  const value = r.b / l.a;
  if (!Number.isFinite(value))
    throw new Error("That doesn't work out to a number");
  return { variable: name, value, steps };
}
