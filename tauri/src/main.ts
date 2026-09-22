/**
 * The app. Wires the two tabs and builds the report form.
 *
 * The UI/backend split is the same as the Python version: everything in
 * src/backend is Landon's, everything else here is the interface. They
 * only ever talk through the types in backend/models.ts.
 */

import {
  makeLabReport,
  makeDataTable,
  pretty,
  formatSignificant,
} from "./backend/models";
import type { LabReport } from "./backend/models";
import { animateIn, animateOut, area, banner, card, el, enhanceSelect, field, row } from "./ui";
import { setUpTheme } from "./theme";
import { CALCULATIONS } from "./backend/chem";
import type { Calculation } from "./backend/chem";
import type { CalcResult } from "./backend/models";
import { buildReport } from "./backend/report";

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
  const title = field(
    "Title of lab",
    "Determining the Density of an Unknown Metal",
  );
  const student = field("Your name");
  const course = field("Class");
  const teacher = field("Teacher");
  const date = field("Date", "", "date");
  const partners = field("Lab partners", "comma separated");

  title.input.addEventListener(
    "input",
    () => (state.info.title = title.input.value),
  );
  student.input.addEventListener(
    "input",
    () => (state.info.studentName = student.input.value),
  );
  course.input.addEventListener(
    "input",
    () => (state.info.course = course.input.value),
  );
  teacher.input.addEventListener(
    "input",
    () => (state.info.teacher = teacher.input.value),
  );
  date.input.addEventListener(
    "input",
    () => (state.info.date = date.input.value),
  );
  partners.input.addEventListener(
    "input",
    () => (state.info.partners = partners.input.value),
  );

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
  materials.input.addEventListener(
    "input",
    () => (state.content.materials = materials.input.value),
  );
  safety.input.addEventListener(
    "input",
    () => (state.content.safety = safety.input.value),
  );

  host.append(
    card(
      "Materials & safety",
      "One item per line — they become bullet points.",
      materials.wrap,
      safety.wrap,
    ),
  );
  // Calculaton options
  const picker = el("select");
  for (const [key, calc] of Object.entries(CALCULATIONS)) {
    picker.append(el("option", { value: key }, [calc.label]));
  }
  const pickerWrap = el("label", { class: "f" }, [
    el("span", {}, ["Calculation"]),
    enhanceSelect(picker),
  ]);
  // Calculation Fields
  const calcFields = el("div", { class: "fields" });
  let calcInputs: HTMLInputElement[] = [];
  function renderCalcFields(key: string): void {
    const calc = CALCULATIONS[key];
    calcFields.replaceChildren();
    calcInputs = [];
    avgValues = [];
    if (calc.listInput) {
      buildValueFinder();
      return;
    }
    for (const label of calc.fields) {
      const f = field(label, "0");
      calcFields.append(f.wrap);
      calcInputs.push(f.input);
    }
  }

  // The unit dropdown. Its options come from the chosen calculation's
  // `units` list in chem.ts, so it's rebuilt whenever the calculation changes.
  const unitPicker = el("select");
  const unitWrap = el("label", { class: "f" }, [el("span", {}, ["Unit"]), enhanceSelect(unitPicker)]);

  function renderUnits(key: string): void {
    unitPicker.replaceChildren();
    for (const u of CALCULATIONS[key].units) {
      unitPicker.append(el("option", { value: u.label }, [u.label || "(no unit)"]));
    }
    unitPicker.disabled = CALCULATIONS[key].units.length < 2;
  }

  /**
   * Convert a finished result into the unit picked in the dropdown.
   * When the number actually changes (factor isn't 1), the conversion is
   * added to the shown work, so the report still shows how you got there.
   */
  function applyUnit(result: CalcResult, calc: Calculation): void {
    const chosen = calc.units.find((u) => u.label === unitPicker.value);
    if (!chosen || chosen.label === result.unit) return;
    if (chosen.factor !== 1) {
      const converted = result.value * chosen.factor;
      const base = calc.units[0].label;
      result.work = `${result.work ?? ""} ${base} = ${formatSignificant(converted)} ${chosen.label}`;
      result.value = converted;
    }
    result.unit = chosen.label;
  }

  picker.addEventListener("change", () => {
    renderCalcFields(picker.value);
    renderUnits(picker.value);
  });
  // Average Ui
  let avgValues: number[] = [];
  const avgChips = el("div", { class: "chips" });

  function renderChips(): void {
    avgChips.replaceChildren();
    if (avgValues.length === 0) {
      avgChips.append(el("span", { class: "chips-empty" }, ["No Value Yet"]));
      return;
    }
    avgValues.forEach((value, i) => {
      const x = el(
        "button",
        { class: "chip-x", type: "button", title: "Remove" },
        ["\u00d7"],
      );
      const chip = el("span", { class: "chip" }, [formatSignificant(value), x]);
      x.addEventListener("click", () => {
        animateOut(chip, () => {
          avgValues.splice(i, 1);
          renderChips();
        });
      });
      avgChips.append(chip);
    });
  }

  function buildValueFinder(): void {
    const box = field("Value", "12.4");
    const add = el("button", { class: "primary", type: "button" }, [
      "Add Value",
    ]);
    function ConfirmValue(): void {
      const raw = box.input.value.trim();
      if (raw === "") return;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        calcResult.replaceChildren(banner(`"${raw}", isnt a number.`, "error"));
        return;
      }
      avgValues.push(n);
      box.input.value = "";
      calcResult.replaceChildren();
      renderChips();
      animateIn(avgChips.lastElementChild);
      box.input.focus();
    }
    add.addEventListener("click", ConfirmValue);
    box.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ConfirmValue();
      }
    });
    calcFields.append(box.wrap, el("div", {}, [add]), avgChips);
    renderChips();
  }

  // Off by default. formatSignificant() handles ordinary numbers plainly,
  // so this is for when you WANT 6.022 × 10²³ rather than 602200000000000000000000.
  const sciBox = el("input", { type: "checkbox" });
  const sciWrap = el("label", { class: "check" }, [
    sciBox,
    el("span", {}, ["Scientific notation"]),
  ]);

  const calcResult = el("div", { class: "fields" });
  const calcButton = el("button", { class: "primary" }, ["Calculate & Add"]);
  calcButton.addEventListener("click", () => {
    const calc = CALCULATIONS[picker.value];
    calcResult.replaceChildren();

    if (calc.listInput) {
      if (avgValues.length === 0) {
        calcResult.append(banner("Add at least one value first.", "error"));
        return;
      }
      try {
        const result = calc.runList
          ? calc.runList(avgValues)
          : calc.run(...avgValues);
        result.sci = sciBox.checked;
        applyUnit(result, calc);
        state.calculations.push(result);
        calcResult.append(banner(`${result.name} = ${pretty(result)}`, "ok"));
        avgValues = [];
        renderChips();
      } catch (e) {
        calcResult.append(banner((e as Error).message, "error"));
      }
      return;
    }
    if (calcInputs.some((input) => input.value.trim() === "")) {
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
      result.sci = sciBox.checked;
        applyUnit(result, calc);
      state.calculations.push(result);
      calcResult.append(banner(`${result.name} = ${pretty(result)}`, "ok"));
    } catch (e) {
      calcResult.append(banner((e as Error).message, "error"));
    }
  });
  renderCalcFields(picker.value);
  renderUnits(picker.value);

  const tablesbox = el("div", { class: "fields" });

  function cell(value: string, onInput: (v: string) => void): HTMLInputElement {
    const input = el("input", { class: "cell" });
    input.value = value;
    input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  function rendertables(): void {
    tablesbox.replaceChildren();
    state.tables.forEach((table, t) => {
      const title = field("Table Title", "Trial Data");
      title.input.value = table.title;
      title.input.addEventListener("input", () => (table.title = title.input.value));

      // Header row: each column name, with an x to delete that column.
      // The x is hidden when only one column is left, so a table can't
      // end up with no columns at all.
      const Headrow = el("tr");
      table.headers.forEach((h, c) => {
        const th = el("th", {}, [cell(h, (v) => (table.headers[c] = v))]);
        if (table.headers.length > 1) {
          const dropCol = el("button", { class: "chip-x col-x", type: "button", title: "Delete column" }, ["\u00d7"]);
          dropCol.addEventListener("click", () => {
            // Every cell in this column: the header plus one per row.
            const column = [...th.closest("table")!.querySelectorAll(`tr > :nth-child(${c + 1})`)];
            animateOut(column, () => {
              table.headers.splice(c, 1);
              for (const row of table.rows) row.splice(c, 1);
              rendertables();
            });
          });
          th.append(dropCol);
        }
        Headrow.append(th);
      });
      Headrow.append(el("th", { class: "row-x-cell" })); // empty corner above the row x's

      // Body: one input per cell, plus an x at the end of each row.
      const body = el("tbody");
      table.rows.forEach((row, r) => {
        const tr = el("tr");
        table.headers.forEach((_, c) => {
          tr.append(el("td", {}, [cell(row[c] ?? "", (v) => (table.rows[r][c] = v))]));
        });
        const dropRow = el("button", { class: "chip-x", type: "button", title: "Delete row" }, ["\u00d7"]);
        dropRow.addEventListener("click", () => {
          animateOut(tr, () => {
            table.rows.splice(r, 1);
            rendertables();
          });
        });
        tr.append(el("td", { class: "row-x-cell" }, [dropRow]));
        body.append(tr);
      });

      const addRow = el("button", { class: "ghost", type: "button" }, ["Add Row"]);
      addRow.addEventListener("click", () => {
        table.rows.push(table.headers.map(() => ""));
        rendertables();
        animateIn(tablesbox.children[t]?.querySelector("tbody")?.lastElementChild);
      });

      // A new column gets a placeholder name, and every existing row gets
      // an empty cell so the rows stay the same width as the headers.
      const addCol = el("button", { class: "ghost", type: "button" }, ["Add Column"]);
      addCol.addEventListener("click", () => {
        table.headers.push(`Column ${table.headers.length + 1}`);
        for (const row of table.rows) row.push("");
        rendertables();
        // The new column is second-to-last: the last one holds the row x's.
        animateIn(...(tablesbox.children[t]?.querySelectorAll("tr > :nth-last-child(2)") ?? []));
      });

      const dropTable = el("button", { class: "chip-x", type: "button", title: "Delete table" }, ["\u00d7"]);
      dropTable.addEventListener("click", () => {
        animateOut(tablesbox.children[t], () => {
          state.tables.splice(t, 1);
          rendertables();
        });
      });

      const grid = el("table", { class: "grid" }, [el("thead", {}, [Headrow]), body]);
      tablesbox.append(
        el("div", { class: "table-block" }, [
          dropTable,
          title.wrap,
          el("div", { class: "grid-wrap" }, [grid]),
          el("div", { class: "actions" }, [addRow, addCol]),
        ]),
      );
    });
  }

  const firsttable = makeDataTable();
  firsttable.rows.push(firsttable.headers.map(() => ""));
  state.tables.push(firsttable);
  rendertables();

  const addTable = el("button", { class: "primary", type: "button" }, ["Add Table"]);
  addTable.addEventListener("click", () => {
    const fresh = makeDataTable();
    fresh.rows.push(fresh.headers.map(() => ""));
    state.tables.push(fresh);
    rendertables();
    animateIn(tablesbox.lastElementChild);
  });

  const qaList = el("div", { class: "fields" });
  function renderQuestions(): void {
    qaList.replaceChildren();
    state.analysis.forEach((qa, i) => {
      const q = field(`Question ${i + 1}`, "What was the purpose of this Lab");
      const a = area("Answer", "Your Answer");
      q.input.value = qa.question;
      a.input.value = qa.answer;
      q.input.addEventListener("input", () => (qa.question = q.input.value));
      a.input.addEventListener("input", () => (qa.answer = a.input.value));
      const x = el(
        "button",
        { class: "chip-x", type: "button", title: "Remove question" },
        ["\u00d7"],
      );
      const box = el("div", { class: "qa-row" }, [x, q.wrap, a.wrap]);
      x.addEventListener("click", () => {
        animateOut(box, () => {
          state.analysis.splice(i, 1);
          renderQuestions();
        });
      });
      qaList.append(box);
    });
  }

  const addQuestion = el("button", { class: "primary", type: "button" }, [
    "Add Question",
  ]);
  addQuestion.addEventListener("click", () => {
    state.analysis.push({ question: "", answer: "" });
    renderQuestions();
    animateIn(qaList.lastElementChild);
  });

  state.analysis.push({ question: "", answer: "" });
  renderQuestions();

  const reportPriview = el("pre", { class: "preview" });
  const reportbutton = el("button", { class: "primary" }, ["Generate Report"]);
  reportbutton.addEventListener("click", () => {
    reportPriview.textContent = buildReport(state);
  });
  // -- The sections still waiting on the backend
  host.append(
    card(
      "Data tables",
      "Click on a header to rename it",
      tablesbox,
      el("div", { class: "actions" }, [addTable]),
    ),
    card(
      "Calculations",
      null,
      row(pickerWrap, unitWrap),
      calcFields,
      el("div", { class: "actions" }, [calcButton, sciWrap]),
      calcResult,
    ),
    card(
      "Analysis questions",
      "Copy Each Question from the lab, then answer it",
      qaList,
      el("div", { class: "actions" }, [addQuestion]),
    ),
    card(
      "Your report",
      "Generate a preview, then save it as Word.",
      el("div", { class: "actions" }, [reportbutton]),
      reportPriview,
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
