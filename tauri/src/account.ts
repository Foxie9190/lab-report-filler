/**
 * The account pop-out.
 *
 * Opened from the button in the header, closed with Escape, the × or a click
 * on the backdrop. It's a real <dialog> rather than a div pretending to be
 * one: the browser handles Escape, the focus trap and making the rest of the
 * window inert, and none of that has to be written or maintained here.
 *
 * Signing in stays optional. With no account the app behaves exactly as it
 * always has — hence a button in the corner rather than a screen in the way.
 */

import {
  apiUrl,
  canChangeServer,
  CloudError,
  currentAccount,
  setApiUrl,
  signIn,
  signOut,
  signUp,
  syncNow,
} from "./cloud";
import { banner, el, field } from "./ui";

/** How a sync result reads. "Nothing to do" beats "0 pushed, 0 pulled". */
function syncText(pushed: number, pulled: number, deleted: number): string {
  const parts: string[] = [];
  if (pushed > 0) parts.push(`${pushed} sent up`);
  if (pulled > 0) parts.push(`${pulled} brought down`);
  if (deleted > 0) parts.push(`${deleted} removed`);
  return parts.length === 0 ? "Already up to date." : `Synced: ${parts.join(", ")}.`;
}

export interface AccountPanel {
  open: () => void;
}

/**
 * @param labsChanged called after anything that may have changed the saved
 *                    labs, so the My labs list can redraw
 */
export function setUpAccount(labsChanged: () => void): AccountPanel {
  const found = document.getElementById("account-dialog") as HTMLDialogElement | null;
  const button = document.getElementById("account-button");
  const label = document.getElementById("account-label");
  if (!found) return { open: () => {} };
  const dialog = found; // a constant TypeScript can see is never null

  const body = el("div", { class: "fields" });
  const message = el("div", { class: "fields" });

  const close = el(
    "button",
    { class: "chip-x sheet-x", type: "button", title: "Close", "aria-label": "Close" },
    ["×"],
  );
  close.addEventListener("click", () => dialog.close());

  const title = el("h2", { id: "account-title" }, ["Account"]);
  const blurb = el("p", { class: "sheet-note" }, [
    "Optional. Signing in keeps your labs on your other computers too. Without an account everything still saves on this computer.",
  ]);

  dialog.replaceChildren(
    el("div", { class: "sheet-inner" }, [close, title, blurb, body, message]),
  );

  // Clicking the dark area outside the panel closes it. The check is on the
  // dialog itself being the click target: clicks inside land on a child.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  function say(text: string, kind: "ok" | "error" | "todo" = "ok"): void {
    message.replaceChildren(banner(text, kind));
  }

  function clear(): void {
    message.replaceChildren();
  }

  /**
   * Free hosting lets a server fall asleep when nobody has used it for a
   * while, and waking it takes most of a minute. Four seconds of nothing
   * looks broken, so this says what's actually going on — without touching
   * the request itself, which is still just waiting like it always was.
   */
  function waking<T>(work: Promise<T>): Promise<T> {
    const timer = window.setTimeout(() => {
      say("Waking the server up — the first try after a quiet spell is slow.", "todo");
    }, 4000);
    return work.finally(() => window.clearTimeout(timer));
  }

  /** The header button says where you stand without opening anything. */
  function updateButton(): void {
    const account = currentAccount();
    if (label) label.textContent = account ? account.email.split("@")[0] : "Sign in";
    button?.setAttribute(
      "title",
      account ? `Signed in as ${account.email}` : "Sign in to sync your labs",
    );
    button?.classList.toggle("in", account !== null);
  }

  function renderSignedIn(email: string): void {
    const sync = el("button", { class: "primary", type: "button" }, ["Sync now"]);
    const out = el("button", { class: "ghost", type: "button" }, ["Sign out"]);

    sync.addEventListener("click", async () => {
      sync.disabled = true;
      say("Syncing…", "todo");
      try {
        const result = await waking(syncNow());
        say(syncText(result.pushed, result.pulled, result.deleted), "ok");
        labsChanged();
      } catch (err) {
        say(err instanceof CloudError ? err.message : String(err), "error");
        render(); // a dead session puts the form back
      } finally {
        sync.disabled = false;
      }
    });

    out.addEventListener("click", async () => {
      await signOut();
      render();
      say("Signed out. Your labs are still on this computer.", "ok");
    });

    body.replaceChildren(
      el("div", { class: "lab-row" }, [
        el("div", {}, [
          el("div", { class: "lab-name" }, [email]),
          el("div", { class: "lab-meta" }, [`Syncing with ${apiUrl()}`]),
        ]),
        el("div", { class: "actions" }, [sync, out]),
      ]),
    );
  }

  function renderSignedOut(): void {
    // field() is the same helper every box in the report form uses, so these
    // match the rest of the app rather than being their own little style.
    const email = field("Email", "you@example.com", "email");
    email.input.autocomplete = "username";

    const password = field("Password", "at least 8 characters", "password");
    password.input.autocomplete = "current-password";

    const enter = el("button", { class: "primary", type: "button" }, ["Sign in"]);
    const create = el("button", { class: "ghost", type: "button" }, ["Create account"]);

    // Development only — see canChangeServer in cloud.ts for why.
    let serverRow: HTMLElement | null = null;
    if (canChangeServer) {
      const server = field("Server address", apiUrl());
      server.input.value = apiUrl();
      server.input.addEventListener("change", () => setApiUrl(server.input.value));
      serverRow = el("details", { class: "server-row" }, [
        el("summary", {}, ["Server address"]),
        server.wrap,
      ]);
    }

    async function go(action: (e: string, p: string) => Promise<{ email: string }>): Promise<void> {
      clear();
      enter.disabled = true;
      create.disabled = true;
      try {
        const account = await waking(action(email.input.value.trim(), password.input.value));
        render();
        say(`Signed in as ${account.email}.`, "ok");
        try {
          const result = await syncNow();
          say(syncText(result.pushed, result.pulled, result.deleted), "ok");
          labsChanged();
        } catch (err) {
          say(err instanceof CloudError ? err.message : String(err), "error");
        }
      } catch (err) {
        say(err instanceof CloudError ? err.message : String(err), "error");
      } finally {
        enter.disabled = false;
        create.disabled = false;
      }
    }

    enter.addEventListener("click", () => void go(signIn));
    create.addEventListener("click", () => void go(signUp));
    for (const input of [email.input, password.input]) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void go(signIn);
        }
      });
    }

    const parts: Node[] = [
      email.wrap,
      password.wrap,
      el("div", { class: "actions" }, [enter, create]),
    ];
    if (serverRow) parts.push(serverRow);
    body.replaceChildren(...parts);
  }

  function render(): void {
    const account = currentAccount();
    if (account) renderSignedIn(account.email);
    else renderSignedOut();
    updateButton();
  }

  function open(): void {
    clear();
    render();
    dialog.showModal();
    // Put the cursor where typing starts, so signing in is keyboard-only.
    dialog.querySelector<HTMLInputElement>("input[type=email]")?.focus();
  }

  button?.addEventListener("click", open);
  render();
  return { open };
}
