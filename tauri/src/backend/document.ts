/**
 * Turns a LabReport into a list of document blocks.  >>> BACKEND. <<<
 *
 * This is the one place that knows the RULES of the report:
 *   - the lab title first, then the byline, then the partners line
 *   - sections in a fixed order:
 *         Material List -> Safety Precautions -> Data
 *         -> Calculations -> Analysis Questions
 *   - safety is easy to forget. It goes in.
 *   - a section with nothing in it is left out completely, not printed empty
 *   - a table row where every cell is blank never prints
 *
 * Nothing here knows about Word, or HTML, or Markdown. It hands back plain
 * objects (see `Block` in models.ts) and lets the renderers argue about
 * fonts. That is the whole point: the rules above are written once, so the
 * preview on screen and the .docx can't drift apart.
 *
 * NEXT JOB FOR THIS FILE (see docs/ROADMAP-3.0.md, Phase 2 step 3):
 * exportDocx.ts still walks the LabReport itself and repeats these rules.
 * Rewriting it to walk Block[] instead is what makes the preview provably
 * honest — and it makes exportDocx.ts shorter, because all the "should this
 * even print?" decisions move out of it.
 */

import type { Block, LabReport } from "./models";
import { pretty } from "./models";

/**
 * The two choices that change WHAT is in the document rather than how it
 * looks. Striped rows and colours are a renderer's business, so they are
 * not here.
 *
 * DocxOptions happens to have both of these fields, so the UI can pass its
 * options object straight in — TS checks by shape, not by name.
 */
export interface DocumentOptions {
  showFormulas: boolean;
  markUnanswered: boolean;
}

export function defaultDocumentOptions(): DocumentOptions {
  return { showFormulas: true, markUnanswered: true };
}

/** A text box's non-blank lines, trimmed. */
export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The whole report, as blocks, top to bottom. */
export function buildDocument(
  report: LabReport,
  options: DocumentOptions = defaultDocumentOptions(),
): Block[] {
  const blocks: Block[] = [];

  // ---- the header ---------------------------------------------------------
  // The title always prints, even on an untouched report, so the preview has
  // something to be. Everything under it only prints when it's been filled.
  blocks.push({ kind: "title", text: report.info.title.trim() || "Lab Report" });

  const who = [
    report.info.studentName,
    report.info.course,
    report.info.teacher,
    report.info.date,
  ]
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (who.length > 0) {
    blocks.push({ kind: "byline", text: who.join(" | ") });
  }
  if (report.info.partners.trim() !== "") {
    blocks.push({
      kind: "labeled",
      label: "Lab Partners: ",
      text: report.info.partners.trim(),
    });
  }

  // ---- materials and safety ----------------------------------------------
  // Same shape twice, so it's a loop rather than two copies.
  const lists = [
    { title: "Material List", text: report.content.materials },
    { title: "Safety Precautions", text: report.content.safety },
  ];
  for (const list of lists) {
    const items = lines(list.text);
    if (items.length === 0) continue;
    blocks.push({ kind: "heading", text: list.title });
    blocks.push({ kind: "bullets", items });
  }

  // ---- data tables --------------------------------------------------------
  // The empty row you added and never filled in shouldn't print, and a table
  // with no rows AND no name shouldn't either. A named-but-empty table stays,
  // because you clearly meant to have it.
  const tables = report.tables
    .map((table) => ({
      ...table,
      rows: table.rows.filter((row) => row.some((cell) => cell.trim() !== "")),
    }))
    .filter(
      (table) =>
        table.headers.length > 0 &&
        (table.rows.length > 0 || table.title.trim() !== ""),
    );

  if (tables.length > 0) {
    blocks.push({ kind: "heading", text: "Data" });
    for (const table of tables) {
      if (table.title.trim() !== "") {
        blocks.push({ kind: "caption", text: table.title.trim() });
      }
      blocks.push({
        kind: "table",
        headers: table.headers,
        // Short rows are padded out, so every row is as wide as the headers.
        rows: table.rows.map((row) =>
          table.headers.map((_, c) => row[c] ?? ""),
        ),
      });
      blocks.push({ kind: "gap" });
    }
  }

  // ---- calculations -------------------------------------------------------
  // pretty() runs HERE, once, so no renderer has to know about units or
  // scientific notation — by the time a block leaves this file the answer is
  // already the string that gets printed.
  if (report.calculations.length > 0) {
    blocks.push({ kind: "heading", text: "Calculations" });
    for (const calc of report.calculations) {
      blocks.push({
        kind: "calc",
        name: calc.name,
        formula: options.showFormulas ? calc.formula.trim() : "",
        work: (calc.work ?? "").trim(),
        answer: pretty(calc),
      });
      blocks.push({ kind: "gap" });
    }
  }

  // ---- analysis questions -------------------------------------------------
  // A pair with both boxes blank is skipped, and the numbering counts only
  // the ones that print — so questions read 1, 2, 3 even if you left an
  // empty row in the middle of the form.
  const asked = report.analysis.filter(
    (qa) => qa.question.trim() !== "" || qa.answer.trim() !== "",
  );
  if (asked.length > 0) {
    blocks.push({ kind: "heading", text: "Analysis Questions" });
    asked.forEach((qa, i) => {
      const answer = lines(qa.answer);
      blocks.push({
        kind: "question",
        number: i + 1,
        question: qa.question.trim(),
        answer,
        unanswered: answer.length === 0 && options.markUnanswered,
      });
    });
  }

  return blocks;
}
