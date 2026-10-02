/**
 * The "there's a new version" strip.
 *
 * The thinking behind it: checking for updates must never get in the way.
 * So it runs after the app is already on screen, it never blocks anything,
 * and if GitHub is unreachable the person sees nothing at all. The backend
 * half (src/backend/updates.ts) already returns null rather than throwing,
 * so there is nothing here to catch.
 *
 * Two bits of restraint:
 *   - at most one check a day, because GitHub allows 60 unauthenticated
 *     requests an hour and there is no reason to spend them
 *   - dismissing a version hides that version for good, so the strip can't
 *     become something you learn to ignore
 */

import { checkForUpdate, RELEASES_PAGE } from "./backend/updates";
import type { Update } from "./backend/updates";
import { el } from "./ui";

const LAST_CHECK = "labfiller.updateCheckedAt";
const DISMISSED = "labfiller.updateDismissed";
const ONE_DAY = 24 * 60 * 60 * 1000;

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the only cost is checking again next launch.
  }
}

/** Has it been a day since the last look? */
function dueForCheck(): boolean {
  const last = Number(remembered(LAST_CHECK) ?? 0);
  return !Number.isFinite(last) || Date.now() - last > ONE_DAY;
}

/** Open the releases page in the real browser, not in the app window. */
async function openPage(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    // The opener plugin hands the link to the operating system. Without it
    // the page would load INSIDE the app, which is not a browser.
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

function showBar(update: Update): void {
  const bar = document.getElementById("update-bar");
  if (!bar) return;

  const download = el("button", { class: "update-get", type: "button" }, [
    "Download",
  ]);
  download.addEventListener("click", () => void openPage(update.url || RELEASES_PAGE));

  const close = el(
    "button",
    { class: "update-x", type: "button", title: "Hide this", "aria-label": "Hide this" },
    ["×"],
  );
  close.addEventListener("click", () => {
    remember(DISMISSED, update.version);
    bar.hidden = true;
  });

  bar.replaceChildren(
    el("span", { class: "update-text" }, [
      el("strong", {}, [`Version ${update.version} is out.`]),
      " Your reports stay where they are — installing is the same as the first time.",
    ]),
    download,
    close,
  );
  bar.hidden = false;
}

/**
 * Call once at startup, after the app is on screen. Returns right away;
 * the strip appears later if there is anything to say.
 */
export function setUpUpdateBar(): void {
  if (!dueForCheck()) return;
  remember(LAST_CHECK, String(Date.now()));

  void checkForUpdate().then((update) => {
    if (update === null) return;
    // Already told about this one and waved away.
    if (remembered(DISMISSED) === update.version) return;
    showBar(update);
  });
}
