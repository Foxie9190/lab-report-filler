/**
 * Shared data shapes for the Lab Report Filler.
 *
 * This file is the CONTRACT between the UI (src/ui) and the backend
 * (src/backend). Both sides agree on these types, so you can write the
 * backend however you like as long as your functions take and return these.
 *
 * Read this one first — everything else makes more sense once you know
 * these shapes.
 *
 * The report template they follow:
 *     Title of lab        -> LabInfo.title
 *     Material list       -> LabContent.materials
 *     Safety precautions  -> LabContent.safety
 *     Data tables         -> DataTable[]  (LabReport.tables)
 *     Analysis questions  -> AnalysisQuestion[]
 *
 * TYPESCRIPT NOTE, since this is your first real TS file:
 * Python used @dataclass. TypeScript has no runtime classes here at all —
 * `interface` describes the SHAPE of a plain object and then vanishes when
 * the code compiles. It is a promise to the compiler, not a thing that
 * exists while the app runs. So there is nothing to `new`; you just write
 * `{ title: "Density", studentName: "Landon", ... }` and TS checks it
 * matches. The `make…` helper functions below are the stand-ins for
 * Python's default values.
 *
 * Field names are camelCase here (studentName, not student_name) because
 * that is the convention in TS, the same way snake_case was in Python.
 */

/** The header stuff — who / what / when. */
export interface LabInfo {
  title: string;
  studentName: string;
  course: string;
  teacher: string;
  date: string;
  partners: string;
}

/**
 * The written sections of the report.
 *
 * Both are plain multi-line strings — one item per line — because that is
 * what a <textarea> gives you.
 */
export interface LabContent {
  /** one material per line */
  materials: string;
  /** one precaution per line */
  safety: string;
}

/**
 * One analysis question and the answer you wrote for it.
 * The UI gives a question box and an answer box per row, so this is the
 * pair. Either can be blank.
 */
export interface AnalysisQuestion {
  question: string;
  answer: string;
}

/**
 * One measurements table. A report can have several.
 *
 * title:   e.g. "Trial masses" — optional, printed above the table
 * headers: e.g. ["Trial", "Mass (g)", "Volume (mL)"]
 * rows:    e.g. [["1", "12.4", "5.0"], ["2", "12.6", "5.1"]]
 *
 * Everything is a string because it comes straight out of text boxes.
 * Convert to a number in your chem functions — and handle blanks!
 */
export interface DataTable {
  title: string;
  headers: string[];
  rows: string[][];
}

/**
 * One finished calculation, ready to print in the report.
 *
 * name:    "Percent Error"
 * formula: "|experimental - accepted| / accepted x 100"
 * value:   2.34
 * unit:    "%"
 * work:    the shown work, e.g. "|8.7 - 8.9| / 8.9 x 100 = 2.25%"
 * sci:     print the answer in scientific notation. The UI sets this from
 *          its Scientific notation checkbox; nothing in chem.ts needs to
 *          care about it.
 *
 * `unit`, `work` and `sci` end with `?`, which means OPTIONAL — you may
 * leave them out of the object entirely. That is TS's version of Python's
 * `unit: str = ""` default.
 */
export interface CalcResult {
  name: string;
  formula: string;
  value: number;
  unit?: string;
  work?: string;
  sci?: boolean;
}

/** Everything, bundled. This is what buildReport() receives. */
export interface LabReport {
  info: LabInfo;
  content: LabContent;
  /** in the order shown in the UI */
  tables: DataTable[];
  calculations: CalcResult[];
  analysis: AnalysisQuestion[];
}

// ---------------------------------------------------------------------------
// Empty starting values (Python's dataclass defaults)
// ---------------------------------------------------------------------------

export function makeLabInfo(): LabInfo {
  return { title: "", studentName: "", course: "", teacher: "", date: "", partners: "" };
}

export function makeLabContent(): LabContent {
  return { materials: "", safety: "" };
}

export function makeDataTable(): DataTable {
  return { title: "", headers: ["Trial", "Measurement", "Units"], rows: [] };
}

export function makeLabReport(): LabReport {
  return {
    info: makeLabInfo(),
    content: makeLabContent(),
    tables: [],
    calculations: [],
    analysis: [],
  };
}

/** Grab one column of a table by its header name. Returns [] if not found. */
export function column(table: DataTable, header: string): string[] {
  const i = table.headers.indexOf(header);
  if (i === -1) return [];
  return table.rows.filter((r) => i < r.length).map((r) => r[i]);
}

// ---------------------------------------------------------------------------
// Scientific notation
// ---------------------------------------------------------------------------

// Superscript digits, so an exponent can sit inline in ordinary text.
const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³",
  "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸",
  "9": "⁹",
};

function superscript(text: string): string {
  return [...text].map((ch) => SUPERSCRIPT[ch] ?? ch).join("");
}

/**
 * 6.022e+23 -> "6.022 × 10²³", with real superscript digits.
 *
 * Falls back to a plain number when the exponent is 0, so 8 stays "8"
 * instead of becoming "8 × 10⁰".
 */
export function toScientific(value: number, digits = 4): string {
  if (value === 0) return "0";
  const [rawMantissa, rawExponent] = value.toExponential(Math.max(digits - 1, 0)).split("e");
  const mantissa = trimZeros(rawMantissa);
  const power = Number(rawExponent);
  if (power === 0) return mantissa;
  return `${mantissa} × 10${superscript(String(power))}`;
}

// "1.200" -> "1.2", "8.000" -> "8"
function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

// Matches e-notation inside a longer string, e.g. "6.022e+23".
const E_NOTATION = /(-?\d+\.?\d*)[eE]([+-]?\d+)/g;

/**
 * Rewrite every e-notation number inside a string, so a shown-work line
 * reads the same way as the answer above it.
 */
export function sciText(text: string): string {
  return text.replace(E_NOTATION, (_all, mantissa: string, exponent: string) => {
    const power = Number(exponent);
    const clean = trimZeros(mantissa);
    if (power === 0) return clean;
    return `${clean} × 10${superscript(String(power))}`;
  });
}

/** How a finished calculation reads in the report: "2.25 %". */
export function pretty(result: CalcResult): string {
  const number = result.sci
    ? toScientific(result.value)
    : formatSignificant(result.value, 4);
  return result.unit ? `${number} ${result.unit}` : number;
}

/**
 * Python's f"{value:.4g}" — 4 significant digits, no trailing zeros.
 * TS has no %g, so this is the hand-rolled version.
 */
export function formatSignificant(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  // %g switches to exponent form outside this range, same as Python
  if (exponent < -5 || exponent >= digits) {
    return trimMantissa(value.toExponential(digits - 1));
  }
  return trimZeros(value.toFixed(Math.max(digits - 1 - exponent, 0)));
}

function trimMantissa(text: string): string {
  const [mantissa, exponent] = text.split("e");
  return `${trimZeros(mantissa)}e${exponent}`;
}

/**
 * Thrown by the backend functions you have not written yet.
 *
 * The UI catches this by name and shows a friendly "this part is yours"
 * strip instead of crashing, so the app always runs.
 *
 * TYPESCRIPT NOTE: `extends Error` needs that `Object.setPrototypeOf` line.
 * Without it `instanceof NotBuiltYet` quietly returns false when compiled
 * for older JS targets — a genuinely nasty bug to chase. Leave it there.
 */
export class NotBuiltYet extends Error {
  readonly step: string;
  constructor(step: string) {
    super(`${step} isn't built yet.`);
    this.name = "NotBuiltYet";
    this.step = step;
    Object.setPrototypeOf(this, NotBuiltYet.prototype);
  }
}
