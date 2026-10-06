/**
 * Checks for the math engine.
 *
 *     npm run test:math
 *
 * Every case below is a line of input and the pieces it should come out as.
 * Red is normal right now — the tokenizer is still empty. Go until it's
 * all green, then we move to the parser.
 */

import { tokenize } from "./src/backend/math/tokenize";
import type { Token } from "./src/backend/math/tokenize";

let passed = 0;
let failed = 0;

/** Tokens, written short, so a failure is readable: 3 +(op) x(name) */
function short(tokens: Token[]): string {
  return tokens
    .map((t) =>
      t.kind === "number" ? String(t.value) : t.kind === "name" ? `${t.text}(name)` : `${t.text}(op)`,
    )
    .join(" ");
}

function expect(input: string, want: string): void {
  try {
    const got = short(tokenize(input));
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

/** This input SHOULD be refused. */
function expectRefused(input: string): void {
  try {
    tokenize(input);
    failed++;
    console.log(`FAIL  ${input}\n      should have thrown, didn't`);
  } catch {
    passed++;
  }
}

// ---- the plain cases --------------------------------------------------------
expect("3", "3");
expect("3+4", "3 +(op) 4");
expect("3 + 4", "3 +(op) 4");
expect("3+4*2", "3 +(op) 4 *(op) 2");

// ---- numbers ----------------------------------------------------------------
expect("12", "12");
expect("3.5", "3.5");
expect(".5", "0.5");
expect("2^10", "2 ^(op) 10");

// ---- names ------------------------------------------------------------------
expect("x", "x(name)");
expect("pi", "pi(name)");
expect("x2", "x2(name)");
expect("sin(30)", "sin(name) ((op) 30 )(op)");
expect("x = 5", "x(name) =(op) 5");

// ---- spaces are noise -------------------------------------------------------
expect("   7   ", "7");
expect("", "");

// ---- the messy ones ---------------------------------------------------------
expect("-4", "-(op) 4");
expect("2*(3+4)", "2 *(op) ((op) 3 +(op) 4 )(op)");
expect("max(2, 9)", "max(name) ((op) 2 ,(op) 9 )(op)");

// ---- typos should speak up --------------------------------------------------
expectRefused("3 + $");
expectRefused("5 # 2");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
