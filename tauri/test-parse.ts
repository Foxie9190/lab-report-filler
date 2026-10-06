/**
 * Checks for the parser.
 *
 *     npm run test:parse
 *
 * Trees are printed inside-out so they fit on one line:
 *
 *     2 + 3 * 4   ->   (+ 2 (* 3 4))
 *
 * Read it as "a plus, holding 2 and a times". The deeper something is, the
 * sooner it happens.
 */

import { parse } from "./src/backend/math/parse";
import type { Node } from "./src/backend/math/parse";

let passed = 0;
let failed = 0;

function show(node: Node): string {
  switch (node.kind) {
    case "number":
      return String(node.value);
    case "name":
      return node.text;
    case "unary":
      return `(${node.op} ${show(node.value)})`;
    case "binary":
      return `(${node.op} ${show(node.left)} ${show(node.right)})`;
    case "call":
      return `(${node.name} ${node.args.map(show).join(" ")})`;
  }
}

function expect(input: string, want: string): void {
  try {
    const got = show(parse(input));
    if (got === want) {
      passed++;
    } else {
      failed++;
      console.log(`FAIL  ${input}\n      got  ${got}\n      want ${want}`);
    }
  } catch (err) {
    failed++;
    console.log(`FAIL  ${input}\n      threw ${(err as Error).message}`);
  }
}

function expectRefused(input: string): void {
  try {
    parse(input);
    failed++;
    console.log(`FAIL  ${input}\n      should have been refused, wasn't`);
  } catch {
    passed++;
  }
}

// ---- atoms ------------------------------------------------------------------
expect("7", "7");
expect("3.5", "3.5");
expect("x", "x");
expect("pi", "pi");

// ---- adding and subtracting -------------------------------------------------
expect("2+3", "(+ 2 3)");
expect("2 + 3", "(+ 2 3)");
expect("10-4-3", "(- (- 10 4) 3)");

// ---- precedence: the whole point --------------------------------------------
expect("2+3*4", "(+ 2 (* 3 4))");
expect("2*3+4", "(+ (* 2 3) 4)");
expect("8/4/2", "(/ (/ 8 4) 2)");
expect("1+2*3-4", "(- (+ 1 (* 2 3)) 4)");

// ---- brackets beat everything -----------------------------------------------
expect("(2+3)*4", "(* (+ 2 3) 4)");
expect("2*(3+4)", "(* 2 (+ 3 4))");
expect("((5))", "5");

// ---- powers lean the other way ----------------------------------------------
expect("2^3", "(^ 2 3)");
expect("2^3^2", "(^ 2 (^ 3 2))");
expect("2*3^2", "(* 2 (^ 3 2))");

// ---- minus in front ---------------------------------------------------------
expect("-4", "(- 4)");
expect("-x+2", "(+ (- x) 2)");
expect("3*-2", "(* 3 (- 2))");

// ---- calls ------------------------------------------------------------------
expect("sin(30)", "(sin 30)");
expect("sqrt(x+1)", "(sqrt (+ x 1))");
expect("max(2, 9)", "(max 2 9)");
expect("sin(30)+1", "(+ (sin 30) 1)");

// ---- nonsense should be refused ---------------------------------------------
expectRefused("2+");
expectRefused("(2");
expectRefused("2)");
expectRefused("2 3");
expectRefused("");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
