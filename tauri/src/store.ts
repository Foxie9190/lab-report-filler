/**
 * Where saved labs live — with two homes.
 *
 * In the Tauri app it's the SQLite database in src/backend/db.ts. In a plain
 * browser tab (`npm run dev`) there is no SQLite plugin, so it falls back to
 * localStorage instead. Without that fallback, developing the interface in a
 * browser would break the moment anything tried to save.
 *
 * Everything else in the app talks to THIS file, never to db.ts directly, so
 * neither half has to care which one is in use.
 */

import type { LabReport } from "./backend/models";
import type { LabSummary } from "./backend/db";

export type { LabSummary };

/** True inside the Tauri app, false in a plain browser tab. */
function inTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** The real database. Imported only when it's actually there. */
async function sqlite() {
  return import("./backend/db");
}

// ---- the browser fallback ---------------------------------------------------
// One localStorage key holding every lab. Fine for development; the packaged
// app never takes this path.

const KEY = "labfiller.labs";

interface StoredLab {
  id: number;
  report: LabReport;
  updatedAt: string;
}

function readAll(): StoredLab[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredLab[]) : [];
  } catch {
    return [];
  }
}

function writeAll(labs: StoredLab[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(labs));
  } catch {
    // Storage full or blocked. Nothing useful to do about it here.
  }
}

// ---- the API the rest of the app uses ---------------------------------------

/** Every saved lab, most recently edited first. */
export async function listLabs(): Promise<LabSummary[]> {
  if (inTauri()) return (await sqlite()).listLabs();
  return readAll()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((l) => ({
      id: l.id,
      title: l.report.info.title,
      course: l.report.info.course,
      updatedAt: l.updatedAt,
    }));
}

/** Read one lab back. Null if it isn't there any more. */
export async function loadLab(id: number): Promise<LabReport | null> {
  if (inTauri()) return (await sqlite()).loadLab(id);
  const found = readAll().find((l) => l.id === id);
  // A copy, so editing the form can't quietly rewrite the saved version.
  return found ? (structuredClone(found.report) as LabReport) : null;
}

/** Save. Pass an id to overwrite, or null for a new lab. Returns the id. */
export async function saveLab(report: LabReport, id: number | null): Promise<number> {
  if (inTauri()) return (await sqlite()).saveLab(report, id);
  const labs = readAll();
  const now = new Date().toISOString();
  const entry = { report: structuredClone(report) as LabReport, updatedAt: now };
  if (id === null) {
    id = labs.reduce((most, l) => Math.max(most, l.id), 0) + 1;
    labs.push({ id, ...entry });
  } else {
    const at = labs.findIndex((l) => l.id === id);
    if (at === -1) labs.push({ id, ...entry });
    else labs[at] = { id, ...entry };
  }
  writeAll(labs);
  return id;
}

/** Delete a lab and everything in it. */
export async function deleteLab(id: number): Promise<void> {
  if (inTauri()) return (await sqlite()).deleteLab(id);
  writeAll(readAll().filter((l) => l.id !== id));
}

/** Copy a lab, so a repeated experiment isn't typed twice. */
export async function duplicateLab(id: number): Promise<number | null> {
  if (inTauri()) return (await sqlite()).duplicateLab(id);
  const report = await loadLab(id);
  if (report === null) return null;
  report.info.title = `${report.info.title || "Lab Report"} (copy)`;
  return saveLab(report, null);
}

// ---- which lab was open last ------------------------------------------------
// Just an id, so localStorage is the right place for it in both worlds.

const LAST = "labfiller.lastLab";

export function rememberLastLab(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(LAST);
    else localStorage.setItem(LAST, String(id));
  } catch {
    // Not fatal — the app just opens a blank lab next time.
  }
}

export function lastLabId(): number | null {
  try {
    const raw = localStorage.getItem(LAST);
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
