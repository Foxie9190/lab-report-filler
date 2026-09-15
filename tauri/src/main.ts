/**
 * The app. Wires the two tabs and builds the report form.
 *
 * The UI/backend split is the same as the Python version: everything in
 * src/backend is Landon's, everything else here is the interface. They
 * only ever talk through the types in backend/models.ts.
 */

import { makeLabReport } from "./backend/models";
import type { LabReport } from "./backend/models";
import { area, banner, card, el, field, row } from "./ui";

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
      banner("Waiting on src/backend/chem.ts — percentError is written, the other five are stubs.", "todo"),
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
  setUpTabs();
  buildReportTab();
  buildTrigTab();
}

main();
