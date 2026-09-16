/**
 * Checks the chemistry functions against known answers.
 *
 *     npm test
 *
 * Add a line to `cases` for every new calculation. `want` is what should
 * come out of pretty() — the answer with its unit, exactly as it will
 * appear in the report.
 *
 * This catches the things `npm run check` cannot: a right-shaped but wrong
 * value, a wrong unit, a guard that fires backwards.
 */

import * as chem from "./src/backend/chem";
import { pretty } from "./src/backend/models";
import type { CalcResult } from "./src/backend/models";

let passed = 0;
let failed = 0;

/** Expect a calculation to produce exactly this answer. */
function expect(label: string, run: () => CalcResult, want: string): void {
  try {
    const got = pretty(run());
    if (got === want) {
      console.log(`  pass   ${label.padEnd(24)} ${got}`);
      passed++;
    } else {
      console.log(`  FAIL   ${label.padEnd(24)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
      failed++;
    }
  } catch (e) {
    console.log(`  THREW  ${label.padEnd(24)} ${(e as Error).message}`);
    failed++;
  }
}

/** Expect a calculation to refuse bad input. */
function expectThrows(label: string, run: () => CalcResult): void {
  try {
    const r = run();
    console.log(`  FAIL   ${label.padEnd(24)} should have thrown, returned ${r.value}`);
    failed++;
  } catch {
    console.log(`  pass   ${label.padEnd(24)} refused it`);
    passed++;
  }
}

console.log("\nanswers");
expect("percentError(9.5, 10)",   () => chem.percentError(9.5, 10),   "5 %");
expect("percentError(8.7, 8.9)",  () => chem.percentError(8.7, 8.9),  "2.247 %");
expect("percentYield(4, 5)",      () => chem.percentYield(4, 5),      "80 %");
expect("percentYield(9, 10)",     () => chem.percentYield(9, 10),     "90 %");
expect("density(10, 5)",          () => chem.density(10, 5),          "2 g/mL");
expect("density(12.6, 5.1)",      () => chem.density(12.6, 5.1),      "2.471 g/mL");
expect("molesFromGrams(18, 18)",  () => chem.molesFromGrams(18, 18),  "1 mol");
expect("molesFromGrams(36, 18)",  () => chem.molesFromGrams(36, 18),  "2 mol");
expect("molarity(0.5, 2)",        () => chem.molarity(0.5, 2),        "0.25 M");
expect("molarity(2, 4)",          () => chem.molarity(2, 4),          "0.5 M");
expect("average([1, 2, 6])",      () => chem.average([1, 2, 6]),      "3");
expect("average([5])",            () => chem.average([5]),            "5");

console.log("\nbad input must be refused");
expectThrows("percentError(1, 0)",   () => chem.percentError(1, 0));
expectThrows("percentYield(1, 0)",   () => chem.percentYield(1, 0));
expectThrows("density(1, 0)",        () => chem.density(1, 0));
expectThrows("molesFromGrams(1, 0)", () => chem.molesFromGrams(1, 0));
expectThrows("molarity(1, 0)",       () => chem.molarity(1, 0));
expectThrows("average([])",          () => chem.average([]));

console.log("\nno 17-digit numbers in the shown work");
for (const r of [chem.density(12.6, 5.1), chem.molarity(1, 3)]) {
  const long = /\d\.\d{8,}/.test(r.work ?? "");
  console.log(`  ${long ? "FAIL  " : "pass  "} ${r.name.padEnd(24)} ${r.work}`);
  long ? failed++ : passed++;
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
