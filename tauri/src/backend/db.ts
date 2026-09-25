import Database from "@tauri-apps/plugin-sql";
import type { LabReport } from "./models";
import { makeDataTable, makeLabReport } from "./models";
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lab (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     title         TEXT NOT NULL DEFAULT '',
     student_name  TEXT NOT NULL DEFAULT '',
     course        TEXT NOT NULL DEFAULT '',
     teacher       TEXT NOT NULL DEFAULT '',
     lab_date      TEXT NOT NULL DEFAULT '',
     partners      TEXT NOT NULL DEFAULT '',
     materials     TEXT NOT NULL DEFAULT '',
     safety        TEXT NOT NULL DEFAULT '',
     created_at    TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS data_table (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     lab_id    INTEGER NOT NULL REFERENCES lab(id) ON DELETE CASCADE,
     position  INTEGER NOT NULL,
     title     TEXT NOT NULL DEFAULT ''
   )`,

  `CREATE TABLE IF NOT EXISTS data_column (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     table_id  INTEGER NOT NULL REFERENCES data_table(id) ON DELETE CASCADE,
     position  INTEGER NOT NULL,
     name      TEXT NOT NULL DEFAULT ''
   )`,

  `CREATE TABLE IF NOT EXISTS data_cell (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     table_id   INTEGER NOT NULL REFERENCES data_table(id) ON DELETE CASCADE,
     row_index  INTEGER NOT NULL,
     column_id  INTEGER NOT NULL REFERENCES data_column(id) ON DELETE CASCADE,
     value      TEXT NOT NULL DEFAULT ''
   )`,

  `CREATE TABLE IF NOT EXISTS calculation (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     lab_id    INTEGER NOT NULL REFERENCES lab(id) ON DELETE CASCADE,
     position  INTEGER NOT NULL,
     name      TEXT NOT NULL,
     formula   TEXT NOT NULL DEFAULT '',
     value     REAL NOT NULL,
     unit      TEXT,
     work      TEXT,
     sci       INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS question (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     lab_id    INTEGER NOT NULL REFERENCES lab(id) ON DELETE CASCADE,
     position  INTEGER NOT NULL,
     question  TEXT NOT NULL DEFAULT '',
     answer    TEXT NOT NULL DEFAULT ''
   )`,
];

let db: Database | null = null;

export async function openDatabase(): Promise<Database> {
  if (db) return db;
  db = await Database.load("sqlite:labfiller.db");
  await db.execute("PRAGMA foreign_keys = ON");
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
  return db;
}

export async function saveLab(
  report: LabReport,
  id: number | null = null,
): Promise<number> {
  const db = await openDatabase();
  const { info, content } = report;

  const fields = [
    info.title,
    info.studentName,
    info.course,
    info.teacher,
    info.date,
    info.partners,
    content.materials,
    content.safety,
  ];

  if (id === null) {
    const result = await db.execute(
      `INSERT INTO lab (title, student_name, course, teacher,
                        lab_date, partners, materials, safety)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      fields,
    );
    id = Number(result.lastInsertId);
  } else {
    await db.execute(
      `UPDATE lab SET title = $1, student_name = $2, course = $3, teacher = $4,
                      lab_date = $5, partners = $6, materials = $7, safety = $8,
                      updated_at = datetime('now')
       WHERE id = $9`,
      [...fields, id],
    );
    // Out with the old children. The cells and columns go too, because of
    // ON DELETE CASCADE on data_table.
    await db.execute("DELETE FROM data_table WHERE lab_id = $1", [id]);
    await db.execute("DELETE FROM calculation WHERE lab_id = $1", [id]);
    await db.execute("DELETE FROM question WHERE lab_id = $1", [id]);
  }

  // -- data tables --------------------------------------------------------
  // .entries() gives the index and the item together, which is exactly the
  // position column each row needs.
  for (const [t, table] of report.tables.entries()) {
    const inserted = await db.execute(
      "INSERT INTO data_table (lab_id, position, title) VALUES ($1, $2, $3)",
      [id, t, table.title],
    );
    const tableId = Number(inserted.lastInsertId);

    // Insert the columns first and remember their ids, because every cell
    // has to point at the column it belongs to.
    const columnIds: number[] = [];
    for (const [c, name] of table.headers.entries()) {
      const col = await db.execute(
        "INSERT INTO data_column (table_id, position, name) VALUES ($1, $2, $3)",
        [tableId, c, name],
      );
      columnIds.push(Number(col.lastInsertId));
    }

    for (const [r, row] of table.rows.entries()) {
      for (const [c, value] of row.entries()) {
        await db.execute(
          `INSERT INTO data_cell (table_id, row_index, column_id, value)
           VALUES ($1, $2, $3, $4)`,
          [tableId, r, columnIds[c], value],
        );
      }
    }
  }

  // -- calculations -------------------------------------------------------
  for (const [i, calc] of report.calculations.entries()) {
    await db.execute(
      `INSERT INTO calculation (lab_id, position, name, formula, value, unit, work, sci)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      // SQLite has no boolean, so the checkbox becomes 1 or 0.
      [
        id,
        i,
        calc.name,
        calc.formula,
        calc.value,
        calc.unit ?? null,
        calc.work ?? null,
        calc.sci ? 1 : 0,
      ],
    );
  }

  // -- analysis questions -------------------------------------------------
  for (const [i, qa] of report.analysis.entries()) {
    await db.execute(
      "INSERT INTO question (lab_id, position, question, answer) VALUES ($1, $2, $3, $4)",
      [id, i, qa.question, qa.answer],
    );
  }

  return id;
}

/** One line in the My Labs list. */
export interface LabSummary {
  id: number;
  title: string;
  course: string;
  updatedAt: string;
}

/** Every saved lab, most recently edited first. */
export async function listLabs(): Promise<LabSummary[]> {
  const db = await openDatabase();
  const rows = await db.select<
    { id: number; title: string; course: string; updated_at: string }[]
  >("SELECT id, title, course, updated_at FROM lab ORDER BY updated_at DESC");
  // SQL columns are snake_case, the app is camelCase. Translated once, here,
  // so no other file has to know what the database calls things.
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    course: r.course,
    updatedAt: r.updated_at,
  }));
}

/**
 * Read a lab back out as a LabReport. Null when that id isn't there any
 * more, which can happen if it was deleted between listing and opening.
 *
 * The fiddly part is the tables: cells are stored one per row, so they have
 * to be woven back into a grid.
 */
export async function loadLab(id: number): Promise<LabReport | null> {
  const db = await openDatabase();

  const labs = await db.select<
    {
      title: string;
      student_name: string;
      course: string;
      teacher: string;
      lab_date: string;
      partners: string;
      materials: string;
      safety: string;
    }[]
  >("SELECT * FROM lab WHERE id = $1", [id]);
  if (labs.length === 0) return null;

  const row = labs[0];
  // Start from a blank report, so any field the database doesn't have yet
  // still exists with a sensible default.
  const report = makeLabReport();
  report.info = {
    title: row.title,
    studentName: row.student_name,
    course: row.course,
    teacher: row.teacher,
    date: row.lab_date,
    partners: row.partners,
  };
  report.content = { materials: row.materials, safety: row.safety };

  // -- tables ---------------------------------------------------------------
  const tables = await db.select<{ id: number; title: string }[]>(
    "SELECT id, title FROM data_table WHERE lab_id = $1 ORDER BY position",
    [id],
  );
  for (const t of tables) {
    const columns = await db.select<{ id: number; name: string }[]>(
      "SELECT id, name FROM data_column WHERE table_id = $1 ORDER BY position",
      [t.id],
    );
    const cells = await db.select<
      { row_index: number; column_id: number; value: string }[]
    >("SELECT row_index, column_id, value FROM data_cell WHERE table_id = $1", [
      t.id,
    ]);

    const table = makeDataTable();
    table.title = t.title;
    table.headers = columns.map((c) => c.name);

    // A cell knows its column by id, but the grid needs a position. This
    // answers "which slot in the row is column 47?"
    const slotOf = new Map(columns.map((c, i) => [c.id, i]));

    // How many rows there are: the biggest row_index, plus one.
    const rowCount = cells.reduce(
      (most, c) => Math.max(most, c.row_index + 1),
      0,
    );
    table.rows = Array.from({ length: rowCount }, () => columns.map(() => ""));

    for (const cell of cells) {
      const slot = slotOf.get(cell.column_id);
      if (slot !== undefined) table.rows[cell.row_index][slot] = cell.value;
    }
    report.tables.push(table);
  }

  // -- calculations ---------------------------------------------------------
  const calcs = await db.select<
    {
      name: string;
      formula: string;
      value: number;
      unit: string | null;
      work: string | null;
      sci: number;
    }[]
  >(
    `SELECT name, formula, value, unit, work, sci
     FROM calculation WHERE lab_id = $1 ORDER BY position`,
    [id],
  );
  report.calculations = calcs.map((c) => ({
    name: c.name,
    formula: c.formula,
    value: c.value,
    unit: c.unit ?? undefined,
    work: c.work ?? undefined,
    sci: c.sci === 1, // back from 1/0 to true/false
  }));

  // -- questions ------------------------------------------------------------
  const questions = await db.select<{ question: string; answer: string }[]>(
    "SELECT question, answer FROM question WHERE lab_id = $1 ORDER BY position",
    [id],
  );
  report.analysis = questions.map((q) => ({
    question: q.question,
    answer: q.answer,
  }));

  return report;
}

/** Delete a lab. Its tables, cells, calculations and questions go with it. */
export async function deleteLab(id: number): Promise<void> {
  const db = await openDatabase();
  await db.execute("DELETE FROM lab WHERE id = $1", [id]);
}

/** Copy a lab, so a repeated experiment doesn't have to be typed twice. */
export async function duplicateLab(id: number): Promise<number | null> {
  const report = await loadLab(id);
  if (report === null) return null;
  report.info.title = `${report.info.title || "Lab Report"} (copy)`;
  return saveLab(report, null);
}
