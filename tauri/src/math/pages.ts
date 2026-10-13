/**
 * The Pages area: everything you've worked on, newest first.
 *
 * Same shape as My labs, for the same reason — a list you recognise things
 * in beats a dropdown once there are more than about five.
 */

import { el, field } from "../ui";
import { pageLabel } from "../backend/math/page";
import { deleteMathPage, duplicateMathPage, listMathPages } from "../store";
import { deletePageFromCloud } from "../cloud";
import type { MathPageSummary } from "../store";
import type { Shared } from "./mathTab";

/** "just now", "3 hours ago", "12 Oct" — close enough to be useful. */
function whenText(iso: string): string {
  // SQLite's datetime('now') has no timezone marker; it's UTC.
  const at = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const seconds = (Date.now() - at.getTime()) / 1000;
  if (Number.isNaN(seconds)) return "";
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;
  if (seconds < 7 * 86400) return `${Math.round(seconds / 86400)} days ago`;
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function buildPages(host: HTMLElement, shared: Shared): void {
  const list = el("div", { class: "lab-list" });

  function row(summary: MathPageSummary): HTMLElement {
    const open = el("button", { class: "primary small", type: "button" }, ["Open"]);
    const copy = el("button", { class: "ghost small", type: "button" }, ["Duplicate"]);
    const remove = el("button", { class: "ghost small", type: "button" }, ["Delete"]);

    open.addEventListener("click", () => void shared.openPage(summary.id));

    copy.addEventListener("click", async () => {
      const id = await duplicateMathPage(summary.id);
      if (id !== null) await shared.openPage(id);
    });

    remove.addEventListener("click", async () => {
      // The server first, while the page still knows its cloud id.
      await deletePageFromCloud(summary.id);
      await deleteMathPage(summary.id);
      // Deleting the page you're looking at leaves nothing open, so start a
      // fresh one rather than showing a page that no longer exists.
      if (shared.currentPageId() === summary.id) await shared.openPage(null);
      else await refresh();
    });

    const name = pageLabel(summary.title, summary.preview);
    const lines = summary.lineCount === 1 ? "1 line" : `${summary.lineCount} lines`;

    return el("div", { class: "lab-row" }, [
      el("div", {}, [
        el("div", { class: "lab-name" }, [name]),
        el("div", { class: "lab-meta" }, [`${lines} · ${whenText(summary.updatedAt)}`]),
      ]),
      el("div", { class: "actions" }, [open, copy, remove]),
    ]);
  }

  async function refresh(): Promise<void> {
    let pages: MathPageSummary[] = [];
    try {
      pages = await listMathPages();
    } catch (err) {
      console.error("could not read the saved pages", err);
      list.replaceChildren(el("p", { class: "calc-empty" }, ["Couldn't read your saved pages."]));
      return;
    }
    if (pages.length === 0) {
      list.replaceChildren(
        el("p", { class: "calc-empty" }, [
          "Nothing saved yet. Anything you work out in the other tabs is kept here by itself.",
        ]),
      );
      return;
    }
    list.replaceChildren(...pages.map(row));
  }

  const fresh = el("button", { class: "primary", type: "button" }, ["New page"]);
  fresh.addEventListener("click", () => void shared.openPage(null));

  /*
   * Who the sheets are for.
   *
   * Kept here rather than on each page: it's the same person and usually the
   * same class every time, so typing it once and forgetting about it is the
   * right default — and it's two boxes to change when it isn't.
   */
  function remembering(key: string, label: string, placeholder: string): HTMLElement {
    const box = field(label, placeholder);
    try {
      box.input.value = localStorage.getItem(key) ?? "";
    } catch {
      // No storage — the boxes still work for this session.
    }
    box.input.addEventListener("input", () => {
      try {
        localStorage.setItem(key, box.input.value);
      } catch {
        // Not fatal; the sheet just goes out without a name.
      }
    });
    return box.wrap;
  }

  host.append(
    el("section", { class: "card" }, [
      el("div", { class: "calc-head" }, [el("h2", {}, ["Pages"]), fresh]),
      el("p", { class: "subtitle" }, [
        "Every page of working you've done. They save themselves as you go.",
      ]),
      list,
    ]),
    el("section", { class: "card" }, [
      el("h2", {}, ["On printed sheets"]),
      el("p", { class: "subtitle" }, [
        "Printed at the top of every sheet you save as Word, with today's date.",
      ]),
      el("div", { class: "grid2" }, [
        remembering("labfiller.studentName", "Your name", "Landon Urquhart"),
        remembering("labfiller.studentCourse", "Class", "Algebra 2"),
      ]),
    ]),
  );

  // Rebuilt on every visit, so it can't show a page that's just been deleted.
  shared.whenShown(() => void refresh());
}
