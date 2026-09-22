/**
 * Small helpers for building the page. The DOM equivalent of ui/theme.py's
 * section() / banner() / field().
 *
 * TYPESCRIPT NOTE: `el` is a generic function. `<K extends keyof
 * HTMLElementTagNameMap>` is how you say "K is the name of an HTML tag",
 * which lets TS work out that el("input") gives you an HTMLInputElement
 * with a .value, while el("div") gives you a plain HTMLElement without one.
 * That is why you get autocomplete on the result.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** A titled card. Everything in the app is one of these. */
export function card(title: string, subtitle: string | null, ...body: Node[]): HTMLElement {
  const box = el("section", { class: "card" }, [el("h2", {}, [title])]);
  if (subtitle) box.append(el("p", { class: "subtitle" }, [subtitle]));
  const fields = el("div", { class: "fields" }, body);
  box.append(fields);
  return box;
}

/** An inline coloured message strip. */
export function banner(text: string, kind: "todo" | "error" | "ok" = "todo"): HTMLElement {
  return el("div", { class: `banner ${kind}` }, [text]);
}

/** A labelled single-line input. Returns both so callers can read .value. */
export function field(
  label: string,
  placeholder = "",
  type = "text",
): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = el("input", { type, placeholder });
  const wrap = el("label", { class: "f" }, [el("span", {}, [label]), input]);
  return { wrap, input };
}

/** A labelled multi-line box, for one-item-per-line content. */
export function area(
  label: string,
  placeholder = "",
): { wrap: HTMLElement; input: HTMLTextAreaElement } {
  const input = el("textarea", { placeholder });
  const wrap = el("label", { class: "f" }, [el("span", {}, [label]), input]);
  return { wrap, input };
}

/** Two fields side by side, stacking on a narrow window. */
export function row(...items: Node[]): HTMLElement {
  return el("div", { class: "grid2" }, items);
}

/**
 * Turn a plain <select> into a fully custom dropdown.
 *
 * The real <select> stays in the page, hidden, and remains the source of
 * truth: code elsewhere keeps reading `select.value`, listening for
 * "change", and adding or replacing <option>s exactly as before. This
 * builds a button and a popup list on top of it and keeps the two in step:
 *   - picking from the list sets select.value and fires "change"
 *   - a MutationObserver notices when options are replaced or the select is
 *     disabled, and updates the button to match
 *
 * Keyboard: Up/Down to move, Enter or Space to pick, Escape to close.
 * Clicking anywhere outside closes it.
 */
export function enhanceSelect(select: HTMLSelectElement): HTMLElement {
  const label = el("span", { class: "dd-label" });
  const button = el(
    "button",
    { type: "button", class: "dd-button", "aria-haspopup": "listbox", "aria-expanded": "false" },
    [label],
  );
  const list = el("div", { class: "dd-list", role: "listbox" });
  list.hidden = true;
  select.classList.add("dd-native");
  const wrap = el("div", { class: "dd" }, [select, button, list]);

  let active = -1;
  const options = (): HTMLOptionElement[] => Array.from(select.options);

  function sync(): void {
    const chosen = select.selectedOptions[0];
    label.textContent = chosen ? chosen.textContent : "";
    button.disabled = select.disabled;
  }

  function highlight(i: number): void {
    const items = Array.from(list.children) as HTMLElement[];
    items.forEach((item, j) => item.classList.toggle("active", j === i));
    active = i;
    items[i]?.scrollIntoView({ block: "nearest" });
  }

  function close(): void {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function choose(i: number): void {
    const opt = options()[i];
    if (!opt) return;
    if (select.value !== opt.value) {
      select.value = opt.value;
      select.dispatchEvent(new Event("change"));
    }
    sync();
    close();
    button.focus();
  }

  function open(): void {
    if (select.disabled) return;
    list.replaceChildren();
    options().forEach((opt, i) => {
      const item = el("div", { class: "dd-option", role: "option" }, [opt.textContent ?? ""]);
      if (opt.selected) {
        item.classList.add("selected");
        item.setAttribute("aria-selected", "true");
      }
      item.addEventListener("mousemove", () => highlight(i));
      // preventDefault stops the surrounding <label> from re-clicking the
      // button, which would instantly reopen the list we're closing.
      item.addEventListener("click", (e) => {
        e.preventDefault();
        choose(i);
      });
      list.append(item);
    });
    // Open upward when there isn't room below, e.g. near the window bottom.
    const roomBelow = window.innerHeight - button.getBoundingClientRect().bottom;
    wrap.classList.toggle("up", roomBelow < 280);
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    highlight(select.selectedIndex);
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    if (list.hidden) open();
    else close();
  });

  button.addEventListener("keydown", (e) => {
    const n = select.options.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) {
        open();
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      highlight((active + step + n) % n);
    } else if ((e.key === "Enter" || e.key === " ") && !list.hidden) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" && !list.hidden) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });

  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener("change", sync);
  sync();
  return wrap;
}

/* ---- add / delete animations ---------------------------------------------
 * The render functions rebuild everything from state, so the page can't
 * tell on its own which row is new. Instead, main.ts says so: after adding,
 * it calls animateIn on the new element; for deleting, it calls animateOut,
 * which plays the fade first and only then runs the real delete + re-render.
 * With "reduce motion" on, both skip straight to the end.
 */
function calm(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Slide + fade something in. Call right after it is on the page. */
export function animateIn(...nodes: (Element | null | undefined)[]): void {
  if (calm()) return;
  for (const node of nodes) {
    node?.animate(
      [
        { opacity: 0, transform: "translateY(-6px) scale(0.98)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
    );
  }
}

/**
 * Fade something out, then call `done` (the real delete + re-render).
 * Boxes also fold their height to zero so what's below slides up instead of
 * jumping. Table rows and cells only fade — tables don't fold nicely.
 */
export function animateOut(nodes: Element | Element[], done: () => void): void {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  // A second click while it is already fading would delete twice.
  if (list.some((n) => n.classList.contains("leaving"))) return;
  if (calm() || list.length === 0) {
    done();
    return;
  }
  const runs = list.map((node) => {
    node.classList.add("leaving");
    const inTable = node instanceof HTMLTableRowElement || node instanceof HTMLTableCellElement;
    const frames: Keyframe[] = inTable
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { opacity: 1, height: `${(node as HTMLElement).offsetHeight}px`, transform: "none" },
          { opacity: 0, height: "0px", paddingTop: "0px", paddingBottom: "0px", borderWidth: "0px", transform: "scale(0.97)" },
        ];
    return node.animate(frames, { duration: 200, easing: "ease-in", fill: "forwards" }).finished;
  });
  Promise.all(runs).then(done, done);
}
