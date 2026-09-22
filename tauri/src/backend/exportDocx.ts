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
import { pretty } from "./models";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// The page is US Letter with 1-inch margins, which leaves 6.5 inches for
// content. Word measures in twips (1440 per inch), so that's 9360 wide.
const CONTENT_WIDTH = 9360;

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
  Teal: {
    accent: "00897B",
    dark: "00695C",
    light: "E0F2F1",
    box: "F1F8F7",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
  Navy: {
    accent: "1E88E5",
    dark: "0D47A1",
    light: "E3F2FD",
    box: "F2F7FD",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
  Crimson: {
    accent: "C62828",
    dark: "8E0000",
    light: "FFEBEE",
    box: "FDF3F4",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
  Forest: {
    accent: "2E7D32",
    dark: "1B5E20",
    light: "E8F5E9",
    box: "F3F9F3",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
  Plum: {
    accent: "6A1B9A",
    dark: "4A148C",
    light: "F3E5F5",
    box: "F9F4FB",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
  "Slate (print-friendly)": {
    accent: "455A64",
    dark: "263238",
    light: "ECEFF1",
    box: "F5F7F8",
    ink: "1A1A1A",
    muted: "6B6B6B",
  },
};

export interface DocxOptions {
  theme: string;
  /** Only used when theme is "Custom". A hex colour like "E91E63". */
  customColor?: string;
  showFormulas: boolean;
  stripedRows: boolean;
  markUnanswered: boolean;
}

export function defaultDocxOptions(): DocxOptions {
  return {
    theme: "Teal",
    showFormulas: true,
    stripedRows: true,
    markUnanswered: true,
  };
}

/** Feeds the UI's theme dropdown. "Custom" goes last. */
export function themeNames(): string[] {
  return [...Object.keys(THEMES), CUSTOM];
}

/** The dropdown name that means "use the colour picker". */
export const CUSTOM = "Custom";

// ---- custom colour -----------------------------------------------------------
/*
 * A theme needs six colours, but a person only picks ONE. The other five are
 * made from it by mixing with white or black:
 *   dark  = the colour mixed toward black  (table header, title)
 *   light = mostly white with a hint of it (striped rows)
 *   box   = even closer to white           (calculation boxes)
 *
 * Readability check: white text sits on `dark`, and `accent` is used for
 * headings on white paper. If someone picks a very pale colour (say light
 * yellow), those would be unreadable, so the colour keeps getting darker
 * until it passes: 4.5:1 for `dark` behind white text, 3:1 for `accent`
 * headings (they're big and bold, which is allowed a lower ratio).
 */

type RGB = [number, number, number];

function toRGB(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!/^[0-9a-fA-F]{6}$/.test(full) || Number.isNaN(n)) return [0, 137, 123]; // Teal if it's junk
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return [r, g, b]
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Blend `color` toward `target`. amount 0 = unchanged, 1 = fully target. */
function mix(color: RGB, target: RGB, amount: number): RGB {
  return [0, 1, 2].map((i) => color[i] + (target[i] - color[i]) * amount) as RGB;
}

/** How bright a colour looks to a person (the WCAG formula). */
function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast between a colour and white paper. 21 = black, 1 = white. */
function contrastOnWhite(color: RGB): number {
  return 1.05 / (luminance(color) + 0.05);
}

/** Darken in small steps until the colour reaches `ratio` against white. */
function darkenUntil(color: RGB, ratio: number): RGB {
  let c = color;
  for (let i = 0; i < 20 && contrastOnWhite(c) < ratio; i++) c = mix(c, [0, 0, 0], 0.1);
  return c;
}

const WHITE_RGB: RGB = [255, 255, 255];
const BLACK_RGB: RGB = [0, 0, 0];

/** Build a full theme from one picked colour. */
export function customTheme(hex: string): Theme {
  const base = toRGB(hex);
  const accent = darkenUntil(base, 3);
  const dark = darkenUntil(mix(base, BLACK_RGB, 0.3), 4.5);
  return {
    accent: toHex(accent),
    dark: toHex(dark),
    light: toHex(mix(base, WHITE_RGB, 0.86)),
    box: toHex(mix(base, WHITE_RGB, 0.93)),
    ink: "1A1A1A",
    muted: "6B6B6B",
  };
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
  const theme =
    options.theme === CUSTOM && options.customColor
      ? customTheme(options.customColor)
      : (THEMES[options.theme] ?? THEMES.Teal);
  // Paragraphs AND tables go in here, so the type allows both.
  const children: (Paragraph | Table)[] = [];
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: report.info.title || "Lab Report",
          bold: true,
          color: theme.dark,
          size: 40,
        }),
      ],
    }),
  );
  const who = [
    report.info.studentName,
    report.info.course,
    report.info.teacher,
    report.info.date,
  ]
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join(" | ");
  if (who !== "") {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: who, color: theme.muted, size: 22 })],
      }),
    );
  }
  if (report.info.partners.trim() !== "") {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Lab Partners: ",
            bold: true,
            color: theme.ink,
            size: 22,
          }),
          new TextRun({
            text: report.info.partners.trim(),
            color: theme.ink,
            size: 22,
          }),
        ],
      }),
    );
  }
  // ---- small helpers -------------------------------------------------------

  // A section heading like "Material List": coloured, with a line under it.
  function heading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true, // never leave a heading alone at the bottom of a page
      spacing: { before: 360, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.accent, space: 4 } },
      children: [new TextRun({ text, bold: true, color: theme.accent, size: 28 })],
    });
  }

  // One bullet point.
  function bullet(text: string): Paragraph {
    return new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      children: [new TextRun({ text, color: theme.ink, size: 22 })],
    });
  }

  // A text box keeps only its non-blank lines, trimmed.
  function lines(text: string): string[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
  }

  // ---- materials and safety -------------------------------------------------
  // One bullet per line. A box with nothing in it is left out completely.
  const lists = [
    { title: "Material List", text: report.content.materials },
    { title: "Safety Precautions", text: report.content.safety },
  ];
  for (const list of lists) {
    const items = lines(list.text);
    if (items.length === 0) continue;
    children.push(heading(list.title));
    for (const item of items) children.push(bullet(item));
  }

  // ---- data tables ----------------------------------------------------------
  // Rows where every cell is blank are dropped (the leftover empty row you
  // didn't fill in). A table with nothing typed anywhere is skipped.
  const tables = report.tables
    .map((t) => ({
      ...t,
      rows: t.rows.filter((row) => row.some((cell) => cell.trim() !== "")),
    }))
    .filter((t) => t.headers.length > 0 && (t.rows.length > 0 || t.title.trim() !== ""));

  if (tables.length > 0) {
    children.push(heading("Data"));
    for (const table of tables) {
      if (table.title.trim() !== "") {
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [new TextRun({ text: table.title.trim(), bold: true, color: theme.dark, size: 22 })],
          }),
        );
      }
      children.push(dataTable(table.headers, table.rows));
      children.push(new Paragraph({ children: [] })); // a little gap after
    }
  }

  // A real Word table. Word wants widths twice: once for the columns
  // (columnWidths) and once on every cell. They must add up to the table
  // width, so the last column takes whatever the rounding left over.
  function dataTable(headers: string[], rows: string[][]): Table {
    const each = Math.floor(CONTENT_WIDTH / headers.length);
    const widths = headers.map((_, i) =>
      i === headers.length - 1 ? CONTENT_WIDTH - each * (headers.length - 1) : each,
    );
    const line = { style: BorderStyle.SINGLE, size: 4, color: "BFC5CC" };
    const borders = { top: line, bottom: line, left: line, right: line };

    function makeCell(text: string, col: number, fill: string | null, isHeader: boolean): TableCell {
      return new TableCell({
        width: { size: widths[col], type: WidthType.DXA },
        borders,
        // CLEAR, not SOLID: SOLID paints the cell black in Word.
        shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text,
                bold: isHeader,
                color: isHeader ? "FFFFFF" : theme.ink,
                size: 20,
              }),
            ],
          }),
        ],
      });
    }

    const headerRow = new TableRow({
      tableHeader: true, // repeats at the top if the table runs onto a new page
      children: headers.map((h, c) => makeCell(h, c, theme.dark, true)),
    });
    const bodyRows = rows.map(
      (row, r) =>
        new TableRow({
          children: headers.map((_, c) => {
            const striped = options.stripedRows && r % 2 === 1;
            return makeCell(row[c] ?? "", c, striped ? theme.light : null, false);
          }),
        }),
    );
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      rows: [headerRow, ...bodyRows],
    });
  }

  // ---- calculations ---------------------------------------------------------
  // Each one is a shaded box with a coloured bar down the left side:
  // name, the formula (optional), the shown work, then the answer.
  if (report.calculations.length > 0) {
    children.push(heading("Calculations"));
    for (const calc of report.calculations) {
      const inside: Paragraph[] = [
        new Paragraph({ children: [new TextRun({ text: calc.name, bold: true, color: theme.dark, size: 22 })] }),
      ];
      if (options.showFormulas && calc.formula.trim() !== "") {
        inside.push(
          new Paragraph({
            children: [new TextRun({ text: calc.formula, italics: true, color: theme.muted, size: 20 })],
          }),
        );
      }
      if (calc.work && calc.work.trim() !== "") {
        inside.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Work: ", bold: true, color: theme.ink, size: 20 }),
              new TextRun({ text: calc.work.trim(), color: theme.ink, size: 20 }),
            ],
          }),
        );
      }
      inside.push(
        new Paragraph({
          spacing: { before: 60 },
          children: [
            new TextRun({ text: "Answer: ", bold: true, color: theme.ink, size: 22 }),
            new TextRun({ text: pretty(calc), bold: true, color: theme.accent, size: 24 }),
          ],
        }),
      );
      children.push(box(inside));
      children.push(new Paragraph({ children: [] }));
    }
  }

  // A one-cell table used as a box. (Word has no "box" object — this is
  // the usual trick.) Light fill, and a thick accent line on the left only.
  function box(content: Paragraph[]): Table {
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: theme.box, color: "auto" },
              borders: {
                left: { style: BorderStyle.SINGLE, size: 24, color: theme.accent },
                top: none,
                bottom: none,
                right: none,
              },
              margins: { top: 100, bottom: 100, left: 180, right: 140 },
              children: content,
            }),
          ],
        }),
      ],
    });
  }

  // ---- analysis questions ---------------------------------------------------
  // Rows where both boxes are blank are skipped, same as the preview.
  const asked = report.analysis.filter((qa) => qa.question.trim() !== "" || qa.answer.trim() !== "");
  if (asked.length > 0) {
    children.push(heading("Analysis Questions"));
    asked.forEach((qa, i) => {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 60 },
          keepNext: true, // keep the question on the same page as its answer
          children: [
            new TextRun({ text: `${i + 1}.  `, bold: true, color: theme.accent, size: 22 }),
            new TextRun({ text: qa.question.trim(), bold: true, color: theme.ink, size: 22 }),
          ],
        }),
      );
      const answer = lines(qa.answer);
      if (answer.length > 0) {
        // One paragraph per line of the answer, indented under the question.
        for (const text of answer) {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              children: [new TextRun({ text, color: theme.ink, size: 22 })],
            }),
          );
        }
      } else if (options.markUnanswered) {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: "(not answered)", italics: true, color: theme.muted, size: 22 })],
          }),
        );
      }
    });
  }

  // ---- put it all together --------------------------------------------------
  const doc = new Document({
    creator: report.info.studentName.trim() || undefined,
    title: report.info.title || "Lab Report",
    styles: { default: { document: { run: { font: "Courier New" } } } },
    // Bullets are defined once here and used by name ("bullets") above.
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  // Turn the document into bytes the app can save.
  const bytes = await Packer.toArrayBuffer(doc);
  return new Uint8Array(bytes);
}
