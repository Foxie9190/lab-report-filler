/**
 * Dark / light switching.
 *
 * Dark is the default, so the stylesheet's plain `:root` holds the dark
 * palette and nothing has to be set for it to apply. Light is opt-in:
 * this file puts data-theme="light" on <html>, and the
 * `:root[data-theme="light"]` block in styles.css takes over.
 *
 * The choice is remembered in localStorage. Reading it can throw — a
 * private window, or site data blocked — so every access is wrapped. The
 * page has to work when storage is unavailable, and dark is a fine
 * fallback because it needs no attribute at all.
 */

const KEY = "labfiller.theme";
type Theme = "dark" | "light";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function remember(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not fatal — the theme still applies for this session.
  }
}

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function apply(theme: Theme): void {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  const button = document.getElementById("theme-toggle");
  if (button) {
    // The label names what you'd GET by clicking, not what you're on.
    button.textContent = theme === "light" ? "Dark" : "Light";
    button.setAttribute(
      "aria-label",
      theme === "light" ? "Switch to dark theme" : "Switch to light theme",
    );
  }
}

/** Call once at startup. Restores the saved choice and wires the button. */
export function setUpTheme(): void {
  apply(stored() ?? "dark");
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next: Theme = current() === "light" ? "dark" : "light";
    apply(next);
    remember(next);
  });
}
