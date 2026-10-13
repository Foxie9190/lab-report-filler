/**
 * Checks for the equation solver.
 *
 *     npm run test:solve
 *
 * Each case is an equation and the value of x it should come to. The last
 * group is things it should refuse — refusing well is half the job.
 */

import { parse } from "./src/backend/math/parse";
import { newEnv } from "./src/backend/math/evaluate";
import { mentions, linear, solve } from "./src/backend/math/solve";

let passed = 0;
let failed = 0;

/** Split "3x + 7 = 22" into its two halves and solve. */
function run(equation: string, name = "x") {
  const at = equation.indexOf("=");
  if (at === -1) throw new Error("no = in that");
  return solve(
    parse(equation.slice(0, at)),
    parse(equation.slice(at + 1)),
    name,
    newEnv(true),
  );
}

function expect(equation: string, want: number, name = "x"): void {
  try {
    const got = run(equation, name).value;
    if (Math.abs(got - want) < 1e-9) passed++;
    else {
      failed++;
      console.log(`FAIL  ${equation}\n      got ${name} = ${got}, want ${want}`);
    }
  } catch (err) {
    failed++;
    console.log(`FAIL  ${equation}\n      threw ${(err as Error).message}`);
  }
}

function expectRefused(equation: string): void {
  try {
    const got = run(equation);
    failed++;
    console.log(`FAIL  ${equation}\n      should have been refused, gave ${got.value}`);
  } catch {
    passed++;
  }
}

/**
 * Compare one value. Takes a function rather than a value so that a check
 * which throws is counted as a failure instead of stopping the whole run —
 * the point of a test file is the tally at the end.
 */
function check(label: string, got: () => unknown, want: unknown): void {
  let value: unknown;
  try {
    value = got();
  } catch (err) {
    failed++;
    console.log(`FAIL  ${label}\n      threw ${(err as Error).message}`);
    return;
  }
  if (JSON.stringify(value) === JSON.stringify(want)) passed++;
  else {
    failed++;
    console.log(`FAIL  ${label}\n      got  ${JSON.stringify(value)}\n      want ${JSON.stringify(want)}`);
  }
}

// ---- mentions() -------------------------------------------------------------
check("mentions x in x", () => mentions(parse("x"), "x"), true);
check("mentions x in 3*x + 1", () => mentions(parse("3*x + 1"), "x"), true);
check("mentions x in sin(x)", () => mentions(parse("sin(x)"), "x"), true);
check("mentions x in -x", () => mentions(parse("-x"), "x"), true);
check("no x in 2 + 3", () => mentions(parse("2 + 3"), "x"), false);
check("no x in sin(30) + pi", () => mentions(parse("sin(30) + pi"), "x"), false);
check("y is not x", () => mentions(parse("y + 1"), "x"), false);

// ---- linear() ---------------------------------------------------------------
const env = newEnv(true);
check("linear of 3x + 7", () => linear(parse("3*x + 7"), "x", env), { a: 3, b: 7 });
check("linear of x", () => linear(parse("x"), "x", env), { a: 1, b: 0 });
check("linear of 22", () => linear(parse("22"), "x", env), { a: 0, b: 22 });
check("linear of -x + 2", () => linear(parse("-x + 2"), "x", env), { a: -1, b: 2 });
check("linear of x/2", () => linear(parse("x/2"), "x", env), { a: 0.5, b: 0 });
check("linear of 2*(x + 3)", () => linear(parse("2*(x + 3)"), "x", env), { a: 2, b: 6 });

// ---- solving ----------------------------------------------------------------
expect("3x + 7 = 22".replace("3x", "3*x"), 5);
expect("2*x = 10", 5);
expect("x + 1 = 4", 3);
expect("x - 5 = 0", 5);
expect("5 = 2*x - 1", 3);
expect("2*x + 1 = x + 4", 3);
expect("4*(x - 1) = 8", 3);
expect("x/2 = 6", 12);
expect("-x = -7", 7);
expect("3*x + 2 = 2*x + 2", 0);
expect("2*t + 4 = 10", 3, "t");
expect("x + sin(30) = 1.5", 1);   // the bit that isn't x is just a number

// ---- refusing ---------------------------------------------------------------
expectRefused("x^2 = 4");          // not a straight line
expectRefused("x * x = 9");        // same thing, written differently
expectRefused("sin(x) = 1");       // x inside a function
expectRefused("1/x = 2");          // x on the bottom
expectRefused("x + 1 = x + 2");    // never true
expectRefused("x + 1 = x + 1");    // always true

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
