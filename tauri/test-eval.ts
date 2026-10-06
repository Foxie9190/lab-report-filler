/**
 * Checks for the evaluator.
 *
 *     npm run test:eval
 *
 * Numbers are compared loosely — 0.1 + 0.2 is famously not exactly 0.3 in
 * any language, so "close enough" is the only sane test for floating point.
 */

import { calculate, evaluate, newEnv } from "./src/backend/math/evaluate";
import { parse } from "./src/backend/math/parse";

let passed = 0;
let failed = 0;

function expect(input: string, want: number, degrees = true): void {
  try {
    const got = evaluate(parse(input), newEnv(degrees));
    if (Math.abs(got - want) < 1e-9) {
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
    const got = evaluate(parse(input), newEnv());
    failed++;
    console.log(`FAIL  ${input}\n      should have been refused, gave ${got}`);
  } catch {
    passed++;
  }
}

// ---- arithmetic -------------------------------------------------------------
expect("7", 7);
expect("2+3", 5);
expect("2+3*4", 14);
expect("(2+3)*4", 20);
expect("10-4-3", 3);
expect("8/4/2", 1);
expect("2^3", 8);
expect("2^3^2", 512);
expect("3.5*2", 7);

// ---- minus in front ---------------------------------------------------------
expect("-4", -4);
expect("-2^2", 4);     // the parser made this (-2)^2
expect("3*-2", -6);
expect("-(3+4)", -7);

// ---- constants --------------------------------------------------------------
expect("pi", Math.PI);
expect("e", Math.E);
expect("2*pi", Math.PI * 2);

// ---- functions --------------------------------------------------------------
expect("sqrt(16)", 4);
expect("abs(-3)", 3);
expect("round(2.6)", 3);
expect("max(2, 9)", 9);
expect("min(2, 9, 5)", 2);
expect("log(1000)", 3);
expect("sqrt(3^2 + 4^2)", 5);

// ---- degrees, which is the point for a chemistry student --------------------
expect("sin(30)", 0.5);
expect("cos(60)", 0.5);
expect("sin(0)", 0);
expect("asin(0.5)", 30);
expect("sin(0)", 0, false);          // radians mode
expect("sin(pi/2)", 1, false);

// ---- things that should complain --------------------------------------------
expectRefused("1/0");
expectRefused("sqrt(-1)");
expectRefused("nope(2)");
expectRefused("y");
expectRefused("sqrt(1, 2)");

// ---- variables and ans, through calculate() ---------------------------------
const env = newEnv();
calculate("x = 5", env);
if (env.variables.get("x") === 5) passed++;
else { failed++; console.log("FAIL  x = 5 didn't remember x"); }

if (calculate("x * 3", env) === 15) passed++;
else { failed++; console.log("FAIL  x * 3 after x = 5"); }

if (calculate("ans + 1", env) === 16) passed++;
else { failed++; console.log("FAIL  ans didn't hold the last answer"); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
