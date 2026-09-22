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
 *
 * THE ANIMATION: switching uses the View Transitions API. The browser takes
 * a snapshot of the page, lets us change the theme, then animates from the
 * old picture to the new one. We animate the new one as a circle growing
 * out of the button, so the theme spreads across the window from where you
 * clicked. Where the API doesn't exist, or the person has asked their OS
 * for reduced motion, the theme just switches instantly.
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
    // The icon itself swaps via CSS. The label says what clicking will DO.
    const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

/** Switch with the circular reveal, falling back to an instant switch. */
function switchTo(next: Theme, from: HTMLElement): void {
  const doc = document as Document & {
    startViewTransition?: (update: () => void) => { ready: Promise<void> };
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!doc.startViewTransition || reduceMotion) {
    apply(next);
    remember(next);
    return;
  }

  // The circle starts at the centre of the button and has to grow until it
  // reaches the farthest corner of the window.
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = doc.startViewTransition(() => apply(next));
  remember(next);
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}

/* ---- accent colour ------------------------------------------------------
 * The dots in the header. Picking one puts data-accent="green" (etc.) on
 * <html>, and a matching block in styles.css swaps --action, --tab-on and
 * --pick. Blue is the default and needs no attribute, same trick as dark.
 * The `dot` colour here is only for drawing the dot itself.
 */
const ACCENT_KEY = "labfiller.accent";
const ACCENTS = [
  { name: "blue", label: "Blue", dot: "#3B82F6" },
  { name: "green", label: "Green", dot: "#10B981" },
  { name: "purple", label: "Purple", dot: "#8B5CF6" },
  { name: "orange", label: "Orange", dot: "#F97316" },
  { name: "rose", label: "Rose", dot: "#F43F5E" },
];

function storedAccent(): string {
  try {
    const value = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((a) => a.name === value) ? value! : "blue";
  } catch {
    return "blue";
  }
}

function applyAccent(name: string): void {
  if (name === "blue") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = name;
  // Tick the matching dot, untick the rest.
  document.querySelectorAll<HTMLButtonElement>(".accent-dot").forEach((dot) => {
    dot.setAttribute("aria-checked", String(dot.dataset.accent === name));
  });
  try {
    localStorage.setItem(ACCENT_KEY, name);
  } catch {
    // Not fatal.
  }
}

function setUpAccents(): void {
  const box = document.getElementById("accent-picker");
  if (!box) return;
  for (const accent of ACCENTS) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "accent-dot";
    dot.dataset.accent = accent.name;
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-label", accent.label);
    dot.title = accent.label;
    dot.style.setProperty("--dot", accent.dot);
    dot.addEventListener("click", () => applyAccent(accent.name));
    box.append(dot);
  }
  applyAccent(storedAccent());
}

/** Call once at startup. Restores the saved choices and wires the buttons. */
export function setUpTheme(): void {
  setUpAccents();
  apply(stored() ?? "dark");
  const button = document.getElementById("theme-toggle");
  button?.addEventListener("click", () => {
    switchTo(current() === "light" ? "dark" : "light", button);
  });
}
