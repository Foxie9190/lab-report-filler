/**
 * Builds the Markdown preview.  >>> THIS FILE IS YOURS TO WRITE. <<<
 *
 * One function: take a LabReport, return one Markdown string.
 *
 * THE RULES THAT BIT YOU LAST TIME, so they are written down now:
 *   - The lab title is the ONLY `#` in the whole document.
 *   - Every section below it is `##`. Not `#`, not `###`.
 *   - Section order is fixed:
 *         Material List -> Safety Precautions -> Data
 *         -> Calculations -> Analysis Questions
 *   - Safety is easy to forget. It goes in.
 *   - Any section with nothing in it is left out completely, not printed
 *     empty.
 */

import type { DataTable, LabReport } from "./models";
import { NotBuiltYet } from "./models";

/** Turn a multi-line string into Markdown bullets. */
export function bulletList(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`)
    .join("\n");
}

/** Turn a multi-line string into a numbered list. */
export function numberedList(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");
}

/** One DataTable as a Markdown table. Returns "" if there's nothing in it. */
export function markdownTable(table: DataTable): string {
  if (table.headers.length === 0 || table.rows.length === 0) return "";
  const head = `| ${table.headers.join(" | ")} |`;
  const sep = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const body = table.rows.map((row) => {
    const cells = [...row, ...Array(Math.max(table.headers.length - row.length, 0)).fill("")];
    return `| ${cells.slice(0, table.headers.length).join(" | ")} |`;
  });
  return [head, sep, ...body].join("\n");
}

/** The whole report as one Markdown string. */
export function buildReport(report: LabReport): string {
  throw new NotBuiltYet(`The report builder (report titled "${report.info.title}")`);
}
