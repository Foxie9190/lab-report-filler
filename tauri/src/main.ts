/**
 * The app. Wires the two tabs and builds the report form.
 *
 * The UI/backend split is the same as the Python version: everything in
 * src/backend is Landon's, everything else here is the interface. They
 * only ever talk through the types in backend/models.ts.
 */

import { makeLabReport, pretty } from "./backend/models";
import type { LabReport } from "./backend/models";
import { area, banner, card, el, field, row } from "./ui";
import { setUpTheme } from "./theme";
import { CALCULATIONS } from "./backend/chem";


const VERSION = "0.1.0";

/** Everything the person has typed. One object, same shape as the report. */
const state: LabReport = makeLabReport();

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function setUpTabs(): void {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const other of tabs) {
        const on = other === tab;
        other.setAttribute("aria-selected", String(on));
        const panel = document.getElementById(`panel-${other.dataset.tab}`);
        if (panel) panel.hidden = !on;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Lab report tab
// ---------------------------------------------------------------------------

function buildReportTab(): void {
  const host = document.getElementById("report-sections");
  if (!host) return;

  // -- Lab info
  const title = field("Title of lab", "Determining the Density of an Unknown Metal");
  const student = field("Your name");
  const course = field("Class");
  const teacher = field("Teacher");
  const date = field("Date", "", "date");
  const partners = field("Lab partners", "comma separated");

  title.input.addEventListener("input", () => (state.info.title = title.input.value));
  student.input.addEventListener("input", () => (state.info.studentName = student.input.value));
  course.input.addEventListener("input", () => (state.info.course = course.input.value));
  teacher.input.addEventListener("input", () => (state.info.teacher = teacher.input.value));
  date.input.addEventListener("input", () => (state.info.date = date.input.value));
  partners.input.addEventListener("input", () => (state.info.partners = partners.input.value));

  host.append(
    card(
      "Lab info",
      "The header of the report.",
      title.wrap,
      row(student.wrap, course.wrap),
      row(teacher.wrap, date.wrap),
      partners.wrap,
    ),
  );

  // -- Materials & safety
  const materials = area("Material list", "One material per line");
  const safety = area("Safety precautions", "One precaution per line");
  materials.input.addEventListener("input", () => (state.content.materials = materials.input.value));
  safety.input.addEventListener("input", () => (state.content.safety = safety.input.value));

  host.append(
    card(
      "Materials & safety",
      "One item per line — they become bullet points.",
      materials.wrap,
      safety.wrap,
    ),
  );
  // Calculaton options
  const picker = el("select")
  for (const [key, calc] of Object.entries(CALCULATIONS)) {
    picker.append(el("option",{ value: key }, [calc.label]));
  }
  const pickerWrap = el("label", {class: "f"}, [el("span", {}, ["Calculation"]), picker]);
  // Calculation Fields
  const calcFields = el("div", { class: "fields" });
  let calcInputs: HTMLInputElement[] = [];
  function renderCalcFields(key: string, ): void {
    const calc = CALCULATIONS[key];
    calcFields.replaceChildren();
    calcInputs = [];
    for (const label of calc.fields) {
      const f = field(label, "0");
      calcFields.append(f.wrap);
      calcInputs.push(f.input);
    }
  }
  picker.addEventListener("change", () => renderCalcFields(picker.value))
  renderCalcFields(picker.value);

  const calcResult = el("div", {class: "fields"});
  const calcButton = el("button", {class: "primary"}, ["Calculate & Add"])
  calcButton.addEventListener("click", () => {
    const calc = CALCULATIONS[picker.value];
    calcResult.replaceChildren();

    if (calc.listInput) {
      calcResult.append(banner("Average Is to be Worked on another time", "todo"));
      return;
    }
    if (calcInputs.some((input) => input.value.trim() ===  "")) {
      calcResult.append(banner("Fill in EveryBox First", "error"));
      return;
    }
    const values = calcInputs.map((input) => Number(input.value));
    if (values.some((v) => !Number.isFinite(v))) {
      calcResult.append(banner("Those need to be numbers.", "error"));
      return;
    }

    try {
      const result = calc.run(...values);
      state.calculations.push(result);
      calcResult.append(banner(`${result.name} = ${pretty(result)}`, "ok"));
    } catch (e) {
      calcResult.append(banner((e as Error).message, "error"));
    }

  })
  // -- The sections still waiting on the backend
  host.append(
    card(
      "Data tables",
      null,
      banner("Data tables are next on the UI list — coming in the next pass.", "todo"),
    ),
    card(
      "Calculations",
      null,
      pickerWrap,
      calcFields,
      el("div", {}, [calcButton]),
      calcResult
    ),
    card(
      "Analysis questions",
      null,
      banner("Question and answer rows are next on the UI list.", "todo"),
    ),
    card(
      "Your report",
      "Generate a preview, then save it as Word.",
      banner("Waiting on src/backend/report.ts and src/backend/exportDocx.ts.", "todo"),
    ),
  );
}

// ---------------------------------------------------------------------------
// Trigonometry tab
// ---------------------------------------------------------------------------

function buildTrigTab(): void {
  const host = document.getElementById("trig-sections");
  if (!host) return;

  const expr = field("Expression", "sin(30) + 2^3");
  const out = el("div", { class: "banner todo" }, [
    "Waiting on src/backend/calculator.ts. Read the comment at the top of that file before you start — it explains why this must not use eval().",
  ]);

  host.append(
    card(
      "Trigonometry & scientific maths",
      "Separate from the report, same as before — nothing here feeds into it.",
      expr.wrap,
      el("div", {}, [el("button", { class: "primary" }, ["Solve"])]),
      out,
    ),
  );
}

// ---------------------------------------------------------------------------

function main(): void {
  const version = document.getElementById("version");
  if (version) version.textContent = `v${VERSION} — rewrite in progress`;
  setUpTheme();
  setUpTabs();
  buildReportTab();
  buildTrigTab();
}

main();
