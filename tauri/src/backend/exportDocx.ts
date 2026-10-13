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

import type { Block, LabReport } from "./models";
import { buildDocument } from "./document";
import {
  ImageRun,
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

/**
 * The fonts offered for the document.
 *
 * All of them are already on Windows and macOS, so nothing is downloaded and
 * nothing is embedded in the file. Pick one that isn't installed and Word
 * silently substitutes another, which is why the list is short and boring —
 * boring is what survives being emailed to a teacher.
 *
 * `css` is the same typeface for the on-screen preview, with fallbacks for
 * the machine the app happens to be running on.
 */
export const DOC_FONTS: { name: string; css: string }[] = [
  { name: "Calibri", css: '"Calibri", "Carlito", system-ui, sans-serif' },
  { name: "Times New Roman", css: '"Times New Roman", "Liberation Serif", Times, serif' },
  { name: "Arial", css: '"Arial", "Liberation Sans", Helvetica, sans-serif' },
  { name: "Georgia", css: '"Georgia", "Gelasio", serif' },
  { name: "Cambria", css: '"Cambria", "Caladea", Georgia, serif' },
  { name: "Courier New", css: '"Courier New", Courier, monospace' },
];

export const DEFAULT_FONT = "Calibri";

/** The CSS stack for a font name, for the preview. Falls back to the default. */
export function fontCss(name: string): string {
  return (DOC_FONTS.find((f) => f.name === name) ?? DOC_FONTS[0]).css;
}

export interface DocxOptions {
  theme: string;
  /** One of DOC_FONTS. Anything else falls back to the default. */
  font: string;
  /** Only used when theme is "Custom". A hex colour like "E91E63". */
  customColor?: string;
  showFormulas: boolean;
  stripedRows: boolean;
  markUnanswered: boolean;
}

export function defaultDocxOptions(): DocxOptions {
  return {
    theme: "Teal",
    font: DEFAULT_FONT,
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
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

/** Blend `color` toward `target`. amount 0 = unchanged, 1 = fully target. */
function mix(color: RGB, target: RGB, amount: number): RGB {
  return [0, 1, 2].map(
    (i) => color[i] + (target[i] - color[i]) * amount,
  ) as RGB;
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
  for (let i = 0; i < 20 && contrastOnWhite(c) < ratio; i++)
    c = mix(c, [0, 0, 0], 0.1);
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
/**
 * Word objects from a list of blocks.
 *
 * This is the second of the two renderers that read the SAME block list —
 * preview.ts is the other. Neither knows anything about a LabReport, which
 * is what makes it impossible for the page you see and the file you save to
 * disagree: there is one description of the document, and two ways of
 * drawing it.
 *
 * It also means anything that can produce blocks gets a Word file for free.
 * A page of maths does exactly that; see math/sheet.ts.
 */
export async function blocksToDocx(
  blocks: Block[],
  options: DocxOptions = defaultDocxOptions(),
  meta: { title: string; creator?: string } = { title: "Document" },
): Promise<Uint8Array> {
  const theme =
    options.theme === CUSTOM && options.customColor
      ? customTheme(options.customColor)
      : (THEMES[options.theme] ?? THEMES.Teal);

  // Paragraphs AND tables go in here, so the type allows both.
  const children: (Paragraph | Table)[] = [];

  // ---- the pieces, one function per kind of block --------------------------

  // A section heading like "Material List": coloured, with a line under it.
  function heading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true, // never leave a heading alone at the bottom of a page
      spacing: { before: 360, after: 120 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: theme.accent,
          space: 4,
        },
      },
      children: [
        new TextRun({ text, bold: true, color: theme.accent, size: 28 }),
      ],
    });
  }

  // One bullet point.
  function bullet(text: string): Paragraph {
    return new Paragraph({
      numbering: { reference: "bullets", level: 0 },
      children: [new TextRun({ text, color: theme.ink, size: 22 })],
    });
  }

  // A real Word table. Word wants widths twice: once for the columns
  // (columnWidths) and once on every cell. They must add up to the table
  // width, so the last column takes whatever the rounding left over.
  function dataTable(headers: string[], rows: string[][]): Table {
    const each = Math.floor(CONTENT_WIDTH / headers.length);
    const widths = headers.map((_, i) =>
      i === headers.length - 1
        ? CONTENT_WIDTH - each * (headers.length - 1)
        : each,
    );
    const line = { style: BorderStyle.SINGLE, size: 4, color: "BFC5CC" };
    const borders = { top: line, bottom: line, left: line, right: line };

    function makeCell(
      text: string,
      col: number,
      fill: string | null,
      isHeader: boolean,
    ): TableCell {
      return new TableCell({
        width: { size: widths[col], type: WidthType.DXA },
        borders,
        // CLEAR, not SOLID: SOLID paints the cell black in Word.
        shading: fill
          ? { type: ShadingType.CLEAR, fill, color: "auto" }
          : undefined,
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
            return makeCell(
              row[c] ?? "",
              c,
              striped ? theme.light : null,
              false,
            );
          }),
        }),
    );
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      rows: [headerRow, ...bodyRows],
    });
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
              shading: {
                type: ShadingType.CLEAR,
                fill: theme.box,
                color: "auto",
              },
              borders: {
                left: {
                  style: BorderStyle.SINGLE,
                  size: 24,
                  color: theme.accent,
                },
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

  // ---- the walk ------------------------------------------------------------
  // One case per kind of block, in the order they came. No filtering, no
  // decisions about what belongs in the document — that all happened already,
  // in whatever built the blocks.
  for (const block of blocks) {
    switch (block.kind) {
      case "title":
        children.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                color: theme.dark,
                size: 40,
              }),
            ],
          }),
        );
        break;

      case "byline":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: block.text, color: theme.muted, size: 22 }),
            ],
          }),
        );
        break;

      case "labeled":
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.label,
                bold: true,
                color: theme.ink,
                size: 22,
              }),
              new TextRun({ text: block.text, color: theme.ink, size: 22 }),
            ],
          }),
        );
        break;

      case "heading":
        children.push(heading(block.text));
        break;

      case "bullets":
        for (const item of block.items) children.push(bullet(item));
        break;

      case "caption":
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                color: theme.dark,
                size: 22,
              }),
            ],
          }),
        );
        break;

      case "table":
        children.push(dataTable(block.headers, block.rows));
        break;

      case "calc": {
        const inside: Paragraph[] = [
          new Paragraph({
            children: [
              new TextRun({
                text: block.name,
                bold: true,
                color: theme.dark,
                size: 22,
              }),
            ],
          }),
        ];
        if (block.formula !== "") {
          inside.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: block.formula,
                  italics: true,
                  color: theme.muted,
                  size: 20,
                }),
              ],
            }),
          );
        }
        if (block.work !== "") {
          inside.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Work: ",
                  bold: true,
                  color: theme.ink,
                  size: 20,
                }),
                new TextRun({ text: block.work, color: theme.ink, size: 20 }),
              ],
            }),
          );
        }
        inside.push(
          new Paragraph({
            spacing: { before: 60 },
            children: [
              new TextRun({
                text: "Answer: ",
                bold: true,
                color: theme.ink,
                size: 22,
              }),
              new TextRun({
                text: block.answer,
                bold: true,
                color: theme.accent,
                size: 24,
              }),
            ],
          }),
        );
        children.push(box(inside));
        break;
      }

      case "question":
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 60 },
            keepNext: true, // keep the question with its answer
            children: [
              new TextRun({
                text: `${block.number}.  `,
                bold: true,
                color: theme.accent,
                size: 22,
              }),
              new TextRun({
                text: block.question,
                bold: true,
                color: theme.ink,
                size: 22,
              }),
            ],
          }),
        );
        if (block.answer.length > 0) {
          // One paragraph per line of the answer, indented under the question.
          for (const text of block.answer) {
            children.push(
              new Paragraph({
                indent: { left: 360 },
                children: [new TextRun({ text, color: theme.ink, size: 22 })],
              }),
            );
          }
        } else if (block.unanswered) {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              children: [
                new TextRun({
                  text: "(not answered)",
                  italics: true,
                  color: theme.muted,
                  size: 22,
                }),
              ],
            }),
          );
        }
        break;

      case "image":
        children.push(
          new Paragraph({
            // Centred, with air above and below — a graph dropped straight
            // against the text reads as part of it.
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120 },
            children: [
              new ImageRun({
                type: "png",
                data: block.data,
                transformation: { width: block.width, height: block.height },
                altText: { name: block.alt, description: block.alt, title: block.alt },
              }),
            ],
          }),
        );
        break;

      case "gap":
        children.push(new Paragraph({ children: [] }));
        break;
    }
  }

  // ---- put it all together --------------------------------------------------
  const doc = new Document({
    creator: meta.creator?.trim() || undefined,
    title: meta.title,
    // One default font for every run, so no TextRun has to name it. Word's
    // built-in Title and Heading styles bring their own, which is why the
    // title looks different from the body.
    styles: {
      default: {
        document: {
          run: {
            font: DOC_FONTS.some((f) => f.name === options.font) ? options.font : DEFAULT_FONT,
          },
        },
      },
    },
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

/**
 * A lab report as a Word file.
 *
 * Now a thin wrapper: the report becomes blocks, the blocks become Word.
 * The two document options it holds (showFormulas, markUnanswered) belong to
 * the block stage — they decide what goes IN the document, not how it looks.
 */
export async function buildDocx(
  report: LabReport,
  options: DocxOptions = defaultDocxOptions(),
): Promise<Uint8Array> {
  const blocks = buildDocument(report, {
    showFormulas: options.showFormulas,
    markUnanswered: options.markUnanswered,
  });
  return blocksToDocx(blocks, options, {
    title: report.info.title.trim() || "Lab Report",
    creator: report.info.studentName,
  });
}
