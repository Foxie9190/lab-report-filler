/**
 * Accounts and sync — the app's side of the API in ../server.
 *
 * Signing in is optional and always has been: with no account the app works
 * exactly as it did before, because SQLite on this computer is still the real
 * copy. Sync is a layer on top, not a replacement.
 *
 * THE RULES SYNC FOLLOWS
 *
 *   - Whole labs move, never halves. Merging two half-edited copies of the
 *     same lab is a research project; "newest wins" is a rule a person can
 *     predict, and the loser is still on the other device.
 *   - A failed sync changes nothing. Every step either completes or is left
 *     for next time, so the worst case is being out of date, not wrong.
 *   - Local work is never thrown away to make the server happy. The one
 *     exception is a lab deliberately deleted on another device, which is a
 *     deletion the person asked for.
 */

import {
  cloudIdFor,
  hasAnyLab,
  labIdForCloud,
  labsToPush,
  labUpdatedAt,
  loadLab,
  markLabSynced,
  saveLabFromServer,
  setSyncedThrough,
  syncedThrough,
} from "./backend/db";
import type { LabReport } from "./backend/models";
import { makeDataTable, makeLabReport } from "./backend/models";
import { deleteLab as deleteLocalLab } from "./backend/db";

const API_KEY = "labfiller.apiUrl";
const TOKEN_KEY = "labfiller.token";
const ACCOUNT_KEY = "labfiller.account";
const SINCE_KEY = "labfiller.syncedThrough"; // where the marker USED to live

/*
 * Where the API lives.
 *
 * Set at build time with VITE_API_URL (see .env.example), so the installer
 * you hand out points at the real server without anyone typing anything.
 * Falls back to the local server for development.
 *
 * Vite replaces import.meta.env.VITE_API_URL with the literal string when it
 * builds, so there is no lookup at runtime and no way to change it after.
 */
const DEFAULT_API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8787";

/**
 * True only in `npm run dev`. The server address box is shown in development
 * and hidden in the built app: in a shipped app it is a way to talk someone
 * into sending their email and password to a stranger's server, and it buys
 * them nothing.
 */
export const canChangeServer: boolean = import.meta.env.DEV;

export interface Account {
  id: string;
  email: string;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  deleted: number;
}

/** Thrown with a message meant for the person, not the console. */
export class CloudError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudError";
    Object.setPrototypeOf(this, CloudError.prototype);
  }
}

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the session just won't survive a restart.
  }
}

/** Where the API lives. Changeable, so a hosted copy can replace localhost. */
export function apiUrl(): string {
  // The saved override only counts in development. A built app always uses
  // the address it was built with, whatever is in storage.
  const chosen = canChangeServer ? (remembered(API_KEY) ?? DEFAULT_API) : DEFAULT_API;
  return chosen.replace(/\/+$/, "");
}

export function setApiUrl(url: string): void {
  remember(API_KEY, url.trim() === "" ? null : url.trim());
}

export function currentAccount(): Account | null {
  const raw = remembered(ACCOUNT_KEY);
  if (!raw || !remembered(TOKEN_KEY)) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

export function signedIn(): boolean {
  return currentAccount() !== null;
}

/**
 * One place where every request is made, so the token, the JSON and the error
 * handling are written once.
 */
async function ask<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = remembered(TOKEN_KEY);
  let response: Response;
  try {
    response = await fetch(apiUrl() + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // fetch only throws when the server couldn't be reached at all.
    throw new CloudError("Can't reach the server. Is it running?");
  }

  // A 401 means two different things depending on who asked. With a token,
  // the session died — drop it, or the app sits there insisting it's signed
  // in. Without one, this was a sign-in attempt, and the server's own words
  // ("Email or password is wrong") are the useful answer.
  if (response.status === 401 && token) {
    forget();
    throw new CloudError("Signed out. Sign in again.");
  }

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new CloudError(body?.error ?? `The server said no (${response.status}).`);
  }
  return body as T;
}

function keep(token: string, account: Account): void {
  remember(TOKEN_KEY, token);
  remember(ACCOUNT_KEY, JSON.stringify(account));
}

function forget(): void {
  remember(TOKEN_KEY, null);
  remember(ACCOUNT_KEY, null);
  remember(SINCE_KEY, null); // the old home, cleared for anyone upgrading
  clearMarker(); // a different account's labs are a clean slate
}

/**
 * Forget where sync got to.
 *
 * Deliberately not awaited: the browser preview has no database to clear,
 * and both callers — a dead session and signing out — have to finish either
 * way. A marker left behind is harmless next to that; the next sign-in
 * clears it again.
 */
function clearMarker(): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void setSyncedThrough(null).catch(() => {});
}

/**
 * Where sync left off — now kept in the database, beside the labs it
 * describes.
 *
 * The one-time move from localStorage only applies to a database that
 * already holds labs. An empty one is either brand new or has just lost
 * everything, and both of those want the whole account pulled down rather
 * than an old note telling them there is nothing to fetch.
 */
async function marker(): Promise<string | null> {
  const stored = await syncedThrough();
  if (stored !== null) return stored;

  const old = remembered(SINCE_KEY);
  if (old === null) return null;
  remember(SINCE_KEY, null);
  if (!(await hasAnyLab())) return null;
  await setSyncedThrough(old);
  return old;
}

export async function signUp(email: string, password: string): Promise<Account> {
  const out = await ask<{ token: string; user: Account }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  keep(out.token, out.user);
  return out.user;
}

export async function signIn(email: string, password: string): Promise<Account> {
  const out = await ask<{ token: string; user: Account }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  keep(out.token, out.user);
  return out.user;
}

/** Sign out here. Labs stay on this computer; they just stop syncing. */
export async function signOut(): Promise<void> {
  try {
    await ask("/auth/logout", { method: "POST" });
  } catch {
    // Offline? The local half still has to happen.
  }
  forget();
}

/** The shape a lab takes on the wire. */
interface WireLab {
  id: string;
  title: string;
  course: string;
  info: Record<string, string>;
  content: Record<string, string>;
  tables: unknown[];
  calculations: unknown[];
  questions: unknown[];
  appUpdatedAt: string;
  updatedAt: string;
  deleted: boolean;
}

function toWire(report: LabReport, appUpdatedAt: string) {
  return {
    title: report.info.title,
    course: report.info.course,
    info: {
      studentName: report.info.studentName,
      teacher: report.info.teacher,
      date: report.info.date,
      partners: report.info.partners,
    },
    content: { materials: report.content.materials, safety: report.content.safety },
    tables: report.tables,
    calculations: report.calculations,
    questions: report.analysis,
    appUpdatedAt,
  };
}

/**
 * Back from the wire into a LabReport.
 *
 * Everything is checked rather than trusted. The server cleans what it stores,
 * but a reply could still be from an older version of the app, and one missing
 * field shouldn't take the whole screen down.
 */
function fromWire(lab: WireLab): LabReport {
  const report = makeLabReport();
  const info = lab.info ?? {};
  report.info = {
    title: lab.title ?? "",
    studentName: info.studentName ?? "",
    course: lab.course ?? "",
    teacher: info.teacher ?? "",
    date: info.date ?? "",
    partners: info.partners ?? "",
  };
  report.content = {
    materials: lab.content?.materials ?? "",
    safety: lab.content?.safety ?? "",
  };
  report.tables = (Array.isArray(lab.tables) ? lab.tables : []).map((raw) => {
    const table = makeDataTable();
    const given = raw as Partial<ReturnType<typeof makeDataTable>>;
    table.title = typeof given?.title === "string" ? given.title : "";
    table.headers = Array.isArray(given?.headers) ? given.headers.map(String) : table.headers;
    table.rows = Array.isArray(given?.rows)
      ? given.rows.map((row) => (Array.isArray(row) ? row.map(String) : []))
      : [];
    return table;
  });
  report.calculations = (Array.isArray(lab.calculations) ? lab.calculations : []) as LabReport["calculations"];
  report.analysis = (Array.isArray(lab.questions) ? lab.questions : []) as LabReport["analysis"];
  return report;
}

/**
 * Push what changed here, pull what changed there.
 *
 * Push first on purpose: if something goes wrong halfway, the work that only
 * existed on this computer is already safe.
 */
export async function syncNow(): Promise<SyncReport> {
  if (!signedIn()) throw new CloudError("Sign in first.");
  // The browser preview (npm run dev) has no SQLite, so there is nothing to
  // sync FROM. Said plainly here rather than letting the missing plugin throw
  // a stack trace at the person.
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new CloudError("Sync works in the installed app, not the browser preview.");
  }
  const report: SyncReport = { pushed: 0, pulled: 0, deleted: 0 };

  // ---- push
  for (const pending of await labsToPush()) {
    const lab = await loadLab(pending.id);
    if (lab === null) continue; // deleted while we were looking
    const when = (await labUpdatedAt(pending.id)) ?? new Date().toISOString();
    const body = JSON.stringify(toWire(lab, when));

    if (pending.cloudId) {
      const out = await ask<{ id: string; kept: string }>(`/labs/${pending.cloudId}`, {
        method: "PUT",
        body,
      });
      // kept: "server" means the server's copy was newer. Leave this lab
      // dirty — the pull below brings the newer one down, and nothing of
      // this device's is lost in the meantime.
      if (out.kept === "yours") {
        await markLabSynced(pending.id, out.id);
        report.pushed++;
      }
    } else {
      const out = await ask<{ id: string }>("/labs", { method: "POST", body });
      await markLabSynced(pending.id, out.id);
      report.pushed++;
    }
  }

  // ---- pull
  const since = await marker();
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const out = await ask<{ labs: WireLab[]; serverTime: string }>(`/labs${query}`);

  for (const lab of out.labs) {
    const localId = await labIdForCloud(lab.id);

    if (lab.deleted) {
      // Deleted on another device. That's a deletion the person asked for,
      // so it's the one case where local data goes.
      if (localId !== null) {
        await deleteLocalLab(localId);
        report.deleted++;
      }
      continue;
    }

    if (localId !== null) {
      const mine = await labUpdatedAt(localId);
      // Ours is newer: leave it. The next push sends it up.
      if (mine && mine > lab.appUpdatedAt) continue;
    }
    await saveLabFromServer(fromWire(lab), lab.id, lab.appUpdatedAt);
    report.pulled++;
  }

  // Only now, with everything applied, move the marker. If the loop had
  // thrown, the next sync would ask for the same window again rather than
  // skipping past labs it never wrote.
  await setSyncedThrough(out.serverTime);
  return report;
}

/** Tell the server about a lab deleted here. Best effort. */
export async function deleteFromCloud(localId: number): Promise<void> {
  if (!signedIn()) return;
  try {
    const cloudId = await cloudIdFor(localId);
    if (!cloudId) return;
    await ask(`/labs/${cloudId}`, { method: "DELETE" });
  } catch {
    // Offline: the lab goes locally and the server keeps its copy. Annoying,
    // not harmful — it comes back on the next pull and can be deleted again.
  }
}
