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
import { buildReport } from "./src/backend/report";
import { pretty } from "./src/backend/models";
import type { CalcResult, LabReport } from "./src/backend/models";
import { makeLabReport } from "./src/backend/models";

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

// ---------------------------------------------------------------------------
// report.ts
// ---------------------------------------------------------------------------

/** Expect something to be true about the built report. */
function expectReport(label: string, report: LabReport, check: (md: string) => string | null): void {
  try {
    const problem = check(buildReport(report));
    if (problem === null) {
      console.log(`  pass   ${label}`);
      passed++;
    } else {
      console.log(`  FAIL   ${label}\n           ${problem}`);
      failed++;
    }
  } catch (e) {
    console.log(`  THREW  ${label}\n           ${(e as Error).message}`);
    failed++;
  }
}

/** Every heading in the report, in the order it appears. */
function headings(md: string): string[] {
  return md.split("\n").filter((line) => /^#{1,6} /.test(line)).map((line) => line.trim());
}

function fullReport(): LabReport {
  const r = makeLabReport();
  r.info.title = "Density of an Unknown Metal";
  r.info.studentName = "Landon Urquhart";
  r.info.course = "Chemistry";
  r.content.materials = "balance\ngraduated cylinder\nmetal sample";
  r.content.safety = "goggles\nno open flame";
  r.tables = [{ title: "Trial data", headers: ["Trial", "Mass (g)"], rows: [["1", "12.4"], ["2", "12.6"]] }];
  r.calculations = [chem.density(12.5, 5)];
  r.analysis = [
    { question: "Why did the trials differ?", answer: "Measurement error." },
    { question: "What is the metal?", answer: "" },
  ];
  return r;
}

console.log("\nthe report");

expectReport("the lab title is the only single-# heading", fullReport(), (md) => {
  const ones = headings(md).filter((h) => /^# /.test(h));
  if (ones.length !== 1) return `found ${ones.length} '#' headings: ${JSON.stringify(ones)}`;
  if (!ones[0].includes("Density of an Unknown Metal")) return `the '#' heading is ${JSON.stringify(ones[0])}`;
  return null;
});

expectReport("every section below it is '##'", fullReport(), (md) => {
  const bad = headings(md).slice(1).filter((h) => !/^## /.test(h));
  return bad.length ? `these are not '##': ${JSON.stringify(bad)}` : null;
});

expectReport("sections come in the right order", fullReport(), (md) => {
  const want = ["Material", "Safety", "Data", "Calculation", "Analysis"];
  const got = headings(md).slice(1);
  let at = 0;
  for (const word of want) {
    const found = got.findIndex((h, i) => i >= at && h.includes(word));
    if (found === -1) return `no section heading containing ${JSON.stringify(word)} — got ${JSON.stringify(got)}`;
    at = found + 1;
  }
  return null;
});

expectReport("safety is not forgotten", fullReport(), (md) =>
  md.includes("goggles") ? null : "the safety text is missing");

expectReport("materials become bullets", fullReport(), (md) =>
  md.includes("- balance") ? null : "expected a '- balance' bullet");

expectReport("the data table is there", fullReport(), (md) =>
  md.includes("| Trial | Mass (g) |") ? null : "expected the table header row");

expectReport("the calculation's shown work is there", fullReport(), (md) =>
  md.includes("2.5") ? null : "expected the density answer 2.5 somewhere");

expectReport("both analysis questions are there", fullReport(), (md) => {
  if (!md.includes("Why did the trials differ?")) return "first question missing";
  if (!md.includes("What is the metal?")) return "second question missing";
  return null;
});

expectReport("an empty report has no section headings", makeLabReport(), (md) => {
  const sections = headings(md).filter((h) => /^## /.test(h));
  return sections.length ? `empty sections should be left out, got ${JSON.stringify(sections)}` : null;
});

expectReport("a report with only materials has only that section", (() => {
  const r = makeLabReport();
  r.info.title = "Just Materials";
  r.content.materials = "beaker";
  return r;
})(), (md) => {
  const sections = headings(md).filter((h) => /^## /.test(h));
  if (sections.length !== 1) return `expected 1 section, got ${JSON.stringify(sections)}`;
  return sections[0].includes("Material") ? null : `got ${JSON.stringify(sections[0])}`;
});

console.log("\nthe header under the title");

function withInfo(fill: (r: LabReport) => void): LabReport {
  const r = makeLabReport();
  r.info.title = "Header Test";
  fill(r);
  return r;
}

expectReport("student name appears", withInfo((r) => { r.info.studentName = "Landon Urquhart"; }),
  (md) => md.includes("Landon Urquhart") ? null : "name missing");

expectReport("class, teacher and date appear", withInfo((r) => {
  r.info.course = "Chemistry"; r.info.teacher = "Mr. X"; r.info.date = "2026-09-21";
}), (md) => {
  for (const want of ["Chemistry", "Mr. X", "2026-09-21"]) {
    if (!md.includes(want)) return `${JSON.stringify(want)} missing`;
  }
  return null;
});

expectReport("the header comes right after the title", withInfo((r) => {
  r.info.studentName = "Landon Urquhart"; r.content.materials = "beaker";
}), (md) => {
  const name = md.indexOf("Landon Urquhart"), mats = md.indexOf("## Material");
  return name !== -1 && name < mats ? null : "name should sit between the title and the first section";
});

expectReport("the header is not a heading", withInfo((r) => { r.info.studentName = "Landon Urquhart"; }),
  (md) => md.split("\n").some((l) => l.includes("Landon Urquhart") && l.startsWith("#"))
    ? "the name line starts with # — it should be plain text" : null);

expectReport("lab partners appear when filled", withInfo((r) => { r.info.partners = "Sam, Jo"; }),
  (md) => md.includes("Sam, Jo") ? null : "partners missing");

expectReport("no header line when every field is blank", withInfo(() => {}), (md) => {
  if (md.includes("\u00b7")) return "found a stray separator dot with nothing around it";
  if (/partners/i.test(md)) return "printed a partners line with no partners";
  return md.trim() === "# Header Test" ? null : `expected just the title, got ${JSON.stringify(md)}`;
});

expectReport("blank fields leave no double separators", withInfo((r) => {
  r.info.studentName = "Landon Urquhart"; r.info.date = "2026-09-21";   // class + teacher blank
}), (md) => /\u00b7\s*\u00b7/.test(md) ? "two separators in a row — a blank field slipped in" : null);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
