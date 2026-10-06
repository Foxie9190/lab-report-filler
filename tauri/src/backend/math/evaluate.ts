/**
 * Step three: walk the tree and come back with a number.
 *
 * The thinking is already done. The parser decided what happens first by
 * where it put things in the tree, so this file never worries about
 * precedence, brackets or what order anything goes in. It asks each node
 * what it is, works out its children, and does the one small thing that
 * node means.
 *
 *            +            evaluate(+)  needs both sides
 *           / \           ->  evaluate(2)  = 2
 *          2   *          ->  evaluate(*)  needs both sides
 *             / \                ->  3 and 4, so 12
 *            3   4         ->  2 + 12 = 14
 *
 * That's it. A function that calls itself, three or four cases deep.
 */

import { parse } from "./parse";
import type { Node } from "./parse";

/**
 * What the calculator remembers between lines: whether angles are in
 * degrees, and any variables that have been set.
 */
export interface MathEnv {
  degrees: boolean;
  variables: Map<string, number>;
}

export function newEnv(degrees = true): MathEnv {
  return { degrees, variables: new Map() };
}

/** Names that are always worth the same. */
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

/**
 * The functions, as data rather than a pile of if-statements — the same
 * trick as CALCULATIONS in chem.ts. Adding one is a line here, and the
 * calculator screen can list them without being told.
 *
 * `takes` is how many arguments it needs; -1 means any number.
 * The degree conversions live in here so that evaluate() doesn't have to
 * know that sin is special.
 */
export interface MathFunction {
  takes: number;
  run: (args: number[], env: MathEnv) => number;
}

const toRadians = (x: number, env: MathEnv) =>
  env.degrees ? (x * Math.PI) / 180 : x;
const fromRadians = (x: number, env: MathEnv) =>
  env.degrees ? (x * 180) / Math.PI : x;

export const FUNCTIONS: Record<string, MathFunction> = {
  sqrt: { takes: 1, run: ([x]) => Math.sqrt(x) },
  abs: { takes: 1, run: ([x]) => Math.abs(x) },
  round: { takes: 1, run: ([x]) => Math.round(x) },
  floor: { takes: 1, run: ([x]) => Math.floor(x) },
  ceil: { takes: 1, run: ([x]) => Math.ceil(x) },
  ln: { takes: 1, run: ([x]) => Math.log(x) },
  log: { takes: 1, run: ([x]) => Math.log10(x) },
  sin: { takes: 1, run: ([x], env) => Math.sin(toRadians(x, env)) },
  cos: { takes: 1, run: ([x], env) => Math.cos(toRadians(x, env)) },
  tan: { takes: 1, run: ([x], env) => Math.tan(toRadians(x, env)) },
  asin: { takes: 1, run: ([x], env) => fromRadians(Math.asin(x), env) },
  acos: { takes: 1, run: ([x], env) => fromRadians(Math.acos(x), env) },
  atan: { takes: 1, run: ([x], env) => fromRadians(Math.atan(x), env) },
  min: { takes: -1, run: (args) => Math.min(...args) },
  max: { takes: -1, run: (args) => Math.max(...args) },
};

/**
 * Work out what a tree comes to.
 *
 * Four cases, one per kind of node:
 *
 *   number   give back its value. Nothing to do.
 *   unary    work out the inside, then negate it.
 *   binary   work out BOTH sides, then apply the operator.
 *   name     a variable if it's been set, otherwise a constant,
 *            otherwise complain that nobody knows what it is.
 *   call     work out every argument, find the function in FUNCTIONS,
 *            check it got the right number of them, run it.
 *
 * Two rules worth keeping:
 *   - Dividing by zero should say so, not hand back Infinity.
 *   - A result that isn't a real number (sqrt of a negative, say) should
 *     say so too, rather than letting NaN leak into the graph.
 */
export function evaluate(node: Node, env: MathEnv): number {
  switch (node.kind) {
    case "number":
      return node.value;

    // Braces, because the two consts below are declared inside this case.
    case "binary": {
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (node.op === "/") {
        if (right === 0) throw new Error("Can't divide by zero");
        return left / right;
      }
      if (node.op === "^") return real(left ** right, "that power");
      throw new Error(`I don't know what "${node.op}" means here`);
    }

    case "unary":
      // Only one of these for now, but naming it keeps the door open for
      // things like a percent sign later.
      if (node.op === "-") return -evaluate(node.value, env);
      throw new Error(`I don't know what "${node.op}" means here`);

    case "name": {
      // A variable the person set wins over a constant, so `e = 2` works
      // for someone using e as a variable in a chemistry problem.
      const set = env.variables.get(node.text);
      if (set !== undefined) return set;
      if (node.text in CONSTANTS) return CONSTANTS[node.text];
      throw new Error(`I don't know what "${node.text}" is`);
    }

    case "call": {
      const fn = FUNCTIONS[node.name];
      if (fn === undefined) throw new Error(`I don't know a function called "${node.name}"`);

      const args = node.args.map((arg) => evaluate(arg, env));
      if (fn.takes !== -1 && args.length !== fn.takes) {
        throw new Error(
          `${node.name} takes ${fn.takes} number${fn.takes === 1 ? "" : "s"}, not ${args.length}`,
        );
      }
      if (fn.takes === -1 && args.length === 0) {
        throw new Error(`${node.name} needs at least one number`);
      }

      return real(fn.run(args, env), node.name);
    }
  }
}

/**
 * Stop a non-number from escaping.
 *
 * sqrt(-1) is NaN and 10^400 is Infinity, and either one, left alone,
 * spreads through every calculation that touches it and eventually draws a
 * graph with an invisible hole in it. Better to say so where it happened.
 */
function real(value: number, what: string): number {
  if (Number.isNaN(value)) throw new Error(`${what} doesn't give a real number`);
  if (!Number.isFinite(value)) throw new Error(`${what} is too big to work out`);
  return value;
}

/**
 * A whole typed line: "3 + 4", or "x = 5" to remember a value.
 *
 * The assignment is pulled apart here rather than taught to the parser,
 * because `=` isn't arithmetic: the graph screen hands expressions straight
 * to evaluate(), and it should never be possible for drawing a curve to set
 * a variable as a side effect.
 */
const ASSIGNMENT = /^\s*([a-zA-Z][a-zA-Z0-9]*)\s*=(?!=)(.*)$/;

export function calculate(input: string, env: MathEnv): number {
  const assignment = ASSIGNMENT.exec(input);
  if (assignment !== null) {
    const name = assignment[1];
    const value = evaluate(parse(assignment[2]), env);
    env.variables.set(name, value);
    return value;
  }

  const answer = evaluate(parse(input), env);
  env.variables.set("ans", answer); // so the next line can say `ans * 2`
  return answer;
}
