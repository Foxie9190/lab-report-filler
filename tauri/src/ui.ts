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
