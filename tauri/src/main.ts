/**
 * The app. Builds the report form and wires it to the backend.
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
import {
  animateIn,
  animateOut,
  area,
  banner,
  card,
  el,
  enhanceSelect,
  field,
  row,
} from "./ui";
import { setUpTheme } from "./theme";
import { CALCULATIONS } from "./backend/chem";
import type { Calculation } from "./backend/chem";
import type { CalcResult } from "./backend/models";
import { buildReport } from "./backend/report";
import {
  buildDocx,
  CUSTOM,
  customTheme,
  THEMES,
  themeNames,
} from "./backend/exportDocx";
import type { DocxOptions } from "./backend/exportDocx";
import { fileNameFor, saveDocx } from "./saveFile";

const VERSION = "2.0.1";

/** Everything the person has typed. One object, same shape as the report. */
const state: LabReport = makeLabReport();

// ---------------------------------------------------------------------------
// The report screen
// ---------------------------------------------------------------------------

function buildReportScreen(): void {
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
  const unitWrap = el("label", { class: "f" }, [
    el("span", {}, ["Unit"]),
    enhanceSelect(unitPicker),
  ]);

  function renderUnits(key: string): void {
    unitPicker.replaceChildren();
    for (const u of CALCULATIONS[key].units) {
      unitPicker.append(
        el("option", { value: u.label }, [u.label || "(no unit)"]),
      );
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

  // Everything added so far. state.calculations is the real list — this
  // just draws it, so the card and the report can never disagree.
  const calcList = el("div", { class: "fields" });
  function renderCalcList(): void {
    calcList.replaceChildren();
    if (state.calculations.length === 0) {
      calcList.append(el("span", { class: "chips-empty" }, ["Nothing added yet."]));
      return;
    }
    state.calculations.forEach((result, i) => {
      const x = el("button", { class: "chip-x", type: "button", title: "Remove this calculation" }, ["\u00d7"]);
      const parts: Node[] = [
        x,
        el("div", { class: "calc-name" }, [result.name]),
        el("div", { class: "calc-answer" }, [pretty(result)]),
      ];
      if (result.formula) parts.push(el("div", { class: "calc-formula" }, [result.formula]));
      if (result.work) parts.push(el("div", { class: "calc-work" }, [result.work]));
      const box = el("div", { class: "calc-row" }, parts);
      x.addEventListener("click", () => {
        animateOut(box, () => {
          state.calculations.splice(i, 1);
          renderCalcList();
        });
      });
      calcList.append(box);
    });
  }
  renderCalcList();

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
        renderCalcList();
        animateIn(calcList.lastElementChild);
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
      renderCalcList();
      animateIn(calcList.lastElementChild);
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
      title.input.addEventListener(
        "input",
        () => (table.title = title.input.value),
      );

      // Header row: each column name, with an x to delete that column.
      // The x is hidden when only one column is left, so a table can't
      // end up with no columns at all.
      const Headrow = el("tr");
      table.headers.forEach((h, c) => {
        const th = el("th", {}, [cell(h, (v) => (table.headers[c] = v))]);
        if (table.headers.length > 1) {
          const dropCol = el(
            "button",
            { class: "chip-x col-x", type: "button", title: "Delete column" },
            ["\u00d7"],
          );
          dropCol.addEventListener("click", () => {
            // Every cell in this column: the header plus one per row.
            const column = [
              ...th
                .closest("table")!
                .querySelectorAll(`tr > :nth-child(${c + 1})`),
            ];
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
          tr.append(
            el("td", {}, [cell(row[c] ?? "", (v) => (table.rows[r][c] = v))]),
          );
        });
        const dropRow = el(
          "button",
          { class: "chip-x", type: "button", title: "Delete row" },
          ["\u00d7"],
        );
        dropRow.addEventListener("click", () => {
          animateOut(tr, () => {
            table.rows.splice(r, 1);
            rendertables();
          });
        });
        tr.append(el("td", { class: "row-x-cell" }, [dropRow]));
        body.append(tr);
      });

      const addRow = el("button", { class: "ghost", type: "button" }, [
        "Add Row",
      ]);
      addRow.addEventListener("click", () => {
        table.rows.push(table.headers.map(() => ""));
        rendertables();
        animateIn(
          tablesbox.children[t]?.querySelector("tbody")?.lastElementChild,
        );
      });

      // A new column gets a placeholder name, and every existing row gets
      // an empty cell so the rows stay the same width as the headers.
      const addCol = el("button", { class: "ghost", type: "button" }, [
        "Add Column",
      ]);
      addCol.addEventListener("click", () => {
        table.headers.push(`Column ${table.headers.length + 1}`);
        for (const row of table.rows) row.push("");
        rendertables();
        // The new column is second-to-last: the last one holds the row x's.
        animateIn(
          ...(tablesbox.children[t]?.querySelectorAll(
            "tr > :nth-last-child(2)",
          ) ?? []),
        );
      });

      const dropTable = el(
        "button",
        { class: "chip-x", type: "button", title: "Delete table" },
        ["\u00d7"],
      );
      dropTable.addEventListener("click", () => {
        animateOut(tablesbox.children[t], () => {
          state.tables.splice(t, 1);
          rendertables();
        });
      });

      const grid = el("table", { class: "grid" }, [
        el("thead", {}, [Headrow]),
        body,
      ]);
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

  const addTable = el("button", { class: "primary", type: "button" }, [
    "Add Table",
  ]);
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

  // -- Word export ----------------------------------------------------------
  // Theme dropdown, built from themeNames() so a new theme in exportDocx.ts
  // shows up here by itself.
  const docTheme = el("select");
  for (const name of themeNames())
    docTheme.append(el("option", { value: name }, [name]));

  // -- custom colour picker (only shown when the theme is "Custom") --------
  // Remember the last theme and colour between launches. Storage can fail
  // (private mode etc.), so every access is wrapped.
  const remembered = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const remember = (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not fatal */
    }
  };

  let customColor = remembered("labfiller.docColor") ?? "E91E63";
  const savedTheme = remembered("labfiller.docTheme");
  // Set BEFORE enhanceSelect below, so the custom button shows the saved name.
  if (savedTheme && themeNames().includes(savedTheme))
    docTheme.value = savedTheme;

  const docThemeWrap = el("label", { class: "f" }, [
    el("span", {}, ["Word theme"]),
    enhanceSelect(docTheme),
  ]);

  const SWATCHES = [
    "E53935",
    "E91E63",
    "8E24AA",
    "5E35B1",
    "3949AB",
    "1E88E5",
    "00ACC1",
    "00897B",
    "43A047",
    "C0CA33",
    "FB8C00",
    "6D4C41",
  ];
  const swatchRow = el("div", {
    class: "swatches",
    role: "radiogroup",
    "aria-label": "Pick a colour",
  });
  for (const hex of SWATCHES) {
    const b = el("button", {
      class: "swatch",
      type: "button",
      role: "radio",
      title: `#${hex}`,
      "aria-label": `#${hex}`,
    });
    b.style.setProperty("--dot", `#${hex}`);
    b.dataset.hex = hex;
    b.addEventListener("click", () => setColor(hex));
    swatchRow.append(b);
  }
  // "Any colour": the system colour window, for anything not in the row.
  const anyColor = el("input", {
    type: "color",
    class: "swatch-any",
    title: "Any colour",
    "aria-label": "Any colour",
  });
  anyColor.addEventListener("input", () => setColor(anyColor.value));
  swatchRow.append(anyColor);

  const hexBox = field("Hex code", "#E91E63");
  hexBox.input.maxLength = 7;
  hexBox.input.addEventListener("input", () => {
    const v = hexBox.input.value.replace("#", "").trim();
    if (/^[0-9a-fA-F]{6}$/.test(v)) setColor(v, false); // only once it's a full code
  });

  const customPanel = el("div", { class: "custom-color" }, [
    el("span", { class: "custom-label" }, ["Pick a colour"]),
    swatchRow,
    hexBox.wrap,
  ]);

  // The preview: the actual colours the document will use.
  const preview = el("div", { class: "doc-preview" });
  function renderPreview(): void {
    const t =
      docTheme.value === CUSTOM
        ? customTheme(customColor)
        : (THEMES[docTheme.value] ?? THEMES.Teal);
    const chip = (label: string, bg: string, fg: string) => {
      const c = el("span", { class: "doc-chip" }, [label]);
      c.style.background = `#${bg}`;
      c.style.color = `#${fg}`;
      return c;
    };
    preview.replaceChildren(
      chip("Heading", "FFFFFF", t.accent),
      chip("Table header", t.dark, "FFFFFF"),
      chip("Striped row", t.light, t.ink),
      chip("Calc box", t.box, t.ink),
    );
  }

  function setColor(hex: string, updateBox = true): void {
    customColor = hex.replace("#", "").toUpperCase();
    remember("labfiller.docColor", customColor);
    if (updateBox) hexBox.input.value = `#${customColor}`;
    anyColor.value = `#${customColor.toLowerCase()}`;
    swatchRow.querySelectorAll<HTMLButtonElement>(".swatch").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.hex === customColor));
    });
    renderPreview();
  }

  function showCustom(): void {
    customPanel.hidden = docTheme.value !== CUSTOM;
    remember("labfiller.docTheme", docTheme.value);
    renderPreview();
  }
  docTheme.addEventListener("change", showCustom);
  setColor(customColor);
  showCustom();

  // A labelled checkbox, ticked to start with.
  function option(text: string): { box: HTMLInputElement; wrap: HTMLElement } {
    const box = el("input", { type: "checkbox" });
    box.checked = true;
    return {
      box,
      wrap: el("label", { class: "check" }, [box, el("span", {}, [text])]),
    };
  }
  const showFormulas = option("Show formulas");
  const stripedRows = option("Striped table rows");
  const markUnanswered = option("Mark unanswered questions");

  const saveStatus = el("div", { class: "fields" });
  const saveButton = el("button", { class: "primary", type: "button" }, [
    "Save as Word",
  ]);
  saveButton.addEventListener("click", async () => {
    const options: DocxOptions = {
      theme: docTheme.value,
      customColor,
      showFormulas: showFormulas.box.checked,
      stripedRows: stripedRows.box.checked,
      markUnanswered: markUnanswered.box.checked,
    };
    saveButton.disabled = true; // stops a double-click saving twice
    try {
      const bytes = await buildDocx(state, options);
      const where = await saveDocx(bytes, fileNameFor(state.info.title));
      saveStatus.replaceChildren(where ? banner(`Saved: ${where}`, "ok") : "");
    } catch (err) {
      saveStatus.replaceChildren(
        banner(`Couldn't save the Word file: ${String(err)}`, "error"),
      );
    } finally {
      saveButton.disabled = false;
    }
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
      el("h3", { class: "sub" }, ["Added to the report"]),
      calcList,
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
      docThemeWrap,
      customPanel,
      preview,
      el("div", { class: "actions" }, [
        showFormulas.wrap,
        stripedRows.wrap,
        markUnanswered.wrap,
      ]),
      el("div", { class: "actions" }, [saveButton]),
      saveStatus,
    ),
  );
}

function main(): void {
  const version = document.getElementById("version");
  if (version) version.textContent = `v${VERSION}`;
  setUpTheme();
  buildReportScreen();
}

main();
