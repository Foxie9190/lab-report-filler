/**
 * Builds the Word document.  >>> THIS FILE IS YOURS TO WRITE. <<<
 *
 * The Python version used python-docx. The TS equivalent is the `docx`
 * package on npm, which is already a sensible choice and does have a real
 * API for shading and borders — so this should actually be LESS painful
 * than the Python version, where table shading had to be poked in as raw
 * XML.
 *
 *     npm install docx
 *
 * Build from the LabReport object directly, NOT from the Markdown string.
 * Markdown has already thrown away the structure you need.
 *
 * Keep the six themes. They are just six hex colours each, and the UI
 * builds its dropdown from themeNames(), so adding a seventh needs no UI
 * change.
 */

import type { LabReport } from "./models";
import { NotBuiltYet } from "./models";

export interface Theme {
  accent: string;
  dark: string;
  light: string;
  box: string;
  ink: string;
  muted: string;
}

/** The six looks, ported straight from the Python version. */
export const THEMES: Record<string, Theme> = {
  Teal: { accent: "00897B", dark: "00695C", light: "E0F2F1", box: "F1F8F7", ink: "1A1A1A", muted: "6B6B6B" },
  Navy: { accent: "1E88E5", dark: "0D47A1", light: "E3F2FD", box: "F2F7FD", ink: "1A1A1A", muted: "6B6B6B" },
  Crimson: { accent: "C62828", dark: "8E0000", light: "FFEBEE", box: "FDF3F4", ink: "1A1A1A", muted: "6B6B6B" },
  Forest: { accent: "2E7D32", dark: "1B5E20", light: "E8F5E9", box: "F3F9F3", ink: "1A1A1A", muted: "6B6B6B" },
  Plum: { accent: "6A1B9A", dark: "4A148C", light: "F3E5F5", box: "F9F4FB", ink: "1A1A1A", muted: "6B6B6B" },
  "Slate (print-friendly)": { accent: "455A64", dark: "263238", light: "ECEFF1", box: "F5F7F8", ink: "1A1A1A", muted: "6B6B6B" },
};

export interface DocxOptions {
  theme: string;
  showFormulas: boolean;
  stripedRows: boolean;
  markUnanswered: boolean;
}

export function defaultDocxOptions(): DocxOptions {
  return { theme: "Teal", showFormulas: true, stripedRows: true, markUnanswered: true };
}

/** Feeds the UI's theme dropdown. */
export function themeNames(): string[] {
  return Object.keys(THEMES);
}

/**
 * The finished .docx as bytes, ready to write to disk.
 *
 * Returns a Uint8Array rather than a file path, so that saving stays the
 * UI's job — same split as the Python version, where this returned bytes.
 */
export async function buildDocx(
  report: LabReport,
  options: DocxOptions = defaultDocxOptions(),
): Promise<Uint8Array> {
  throw new NotBuiltYet(`Word export (${options.theme} theme, ${report.calculations.length} calculations)`);
}
