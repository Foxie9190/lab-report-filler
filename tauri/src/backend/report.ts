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
import { pretty } from "./models";

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
  const parts: string[] = [];
  parts.push(`# ${report.info.title || "Lab Report"}`);
  if (report.content.materials.trim()) {
    parts.push("## Material List\n\n" + bulletList(report.content.materials));
  }
  if (report.content.safety.trim()) {
    parts.push("## Safety Precautions\n\n" + bulletList(report.content.safety));
  }
  const tableChuncks: string[] = [];
  for (const table of report.tables) {
    const md = markdownTable(table);
    if (md === "") continue;
    if (table.title.trim()) {
      tableChuncks.push(`**${table.title}**\n\n${md}`);
    } else {
      tableChuncks.push(md);
    }
  }
  if (tableChuncks.length > 0) {
    parts.push("## Data\n\n" + tableChuncks.join("\n\n"));
  }
  const calcBlocks: string[] = [];
  for (const calc of report.calculations) {
    const lines = [`**${calc.name}**`, "", `- Formula: ${calc.formula}`];
    if (calc.work) lines.push(`- Work: ${calc.work}`);
    lines.push(`- Answer: **${pretty(calc)}**`);
    calcBlocks.push(lines.join("\n"));
  }
  if (calcBlocks.length > 0) {
    parts.push("## Calculations\n\n" + calcBlocks.join("\n\n"));
  }
  const asked = report.analysis.filter((qa) => qa.question.trim() || qa.answer.trim());
  if (asked.length > 0) {
    const blocks = asked.map((qa, i) => {
      const answer = qa.answer.trim() || "_(not answered)_";
      return `${i + 1}. **${qa.question.trim()}**\n\n   ${answer}`
    });
    parts.push("## Analysis Questions\n\n" + blocks.join("\n\n"));
  }

  return parts.join('\n\n');
}
