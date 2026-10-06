/**
 * The graph.
 *
 * Type y = x^2 - 3 and watch it drawn. The parser turns each line into a
 * tree once; drawing then evaluates that tree about a thousand times, once
 * per pixel column, which is why the engine had to be a tree walk rather
 * than something that re-reads the text every time.
 *
 * Three things make a hand-rolled plotter look wrong, and all three are
 * handled below:
 *   - a canvas drawn at CSS size on a Retina screen looks blurry, so it is
 *     drawn at device resolution and scaled back
 *   - a function with a break in it (tan, or 1/x) gets a vertical line
 *     through the gap unless the path is cut where the jump is absurd
 *   - x values where the maths fails (sqrt of a negative) are holes, not
 *     zeroes, so the line stops and starts again
 */

import { el } from "../ui";
import { evaluate } from "../backend/math/evaluate";
import { parse } from "../backend/math/parse";
import type { Node } from "../backend/math/parse";
import type { Shared } from "./mathTab";

/** One curve: what was typed, its colour, and the tree it parsed to. */
interface Curve {
  text: string;
  colour: string;
  tree: Node | null;
  error: string | null;
  row: HTMLElement;
}

const COLOURS = ["#3B82F6", "#10B981", "#F97316", "#A855F7", "#EF4444"];

/** The window onto the graph, in maths units rather than pixels. */
interface View {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const START: View = { minX: -10, maxX: 10, minY: -10, maxY: 10 };

/** A step that lands on 1, 2 or 5 times a power of ten, like graph paper. */
function niceStep(range: number, target: number): number {
  const rough = range / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const step of [1, 2, 5, 10]) {
    if (rough <= step * power) return step * power;
  }
  return 10 * power;
}

/** Axis numbers without floating-point dust: 0.30000000000000004 -> 0.3 */
function label(value: number, step: number): string {
  const places = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(places);
}

export function buildGraph(host: HTMLElement, shared: Shared): void {
  const view: View = { ...START };
  const curves: Curve[] = [];

  const canvas = el("canvas", { class: "graph-canvas" });
  const readout = el("div", { class: "graph-readout" });
  readout.hidden = true;
  const list = el("div", { class: "curve-list" });

  // ---- drawing -------------------------------------------------------------

  function draw(): void {
    const context = canvas.getContext("2d");
    if (!context) return;

    // Match the canvas to its real size on screen, in real device pixels.
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return; // hidden; nothing to draw
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = box.width;
    const height = box.height;
    const style = getComputedStyle(canvas);
    const ink = style.getPropertyValue("--ink").trim() || "#E6EAF2";
    const line = style.getPropertyValue("--line").trim() || "#30405C";
    const muted = style.getPropertyValue("--muted").trim() || "#94A3B8";
    const paper = style.getPropertyValue("--field").trim() || "#0D1626";

    const toScreenX = (x: number) => ((x - view.minX) / (view.maxX - view.minX)) * width;
    const toScreenY = (y: number) => height - ((y - view.minY) / (view.maxY - view.minY)) * height;

    context.fillStyle = paper;
    context.fillRect(0, 0, width, height);

    // ---- grid
    const stepX = niceStep(view.maxX - view.minX, 10);
    const stepY = niceStep(view.maxY - view.minY, 8);
    context.lineWidth = 1;
    context.strokeStyle = line;
    context.fillStyle = muted;
    context.font = "11px system-ui, sans-serif";

    context.beginPath();
    for (let x = Math.ceil(view.minX / stepX) * stepX; x <= view.maxX; x += stepX) {
      const sx = Math.round(toScreenX(x)) + 0.5; // +0.5 keeps hairlines crisp
      context.moveTo(sx, 0);
      context.lineTo(sx, height);
    }
    for (let y = Math.ceil(view.minY / stepY) * stepY; y <= view.maxY; y += stepY) {
      const sy = Math.round(toScreenY(y)) + 0.5;
      context.moveTo(0, sy);
      context.lineTo(width, sy);
    }
    context.stroke();

    // ---- axes
    context.strokeStyle = ink;
    context.lineWidth = 1.5;
    context.beginPath();
    if (view.minY < 0 && view.maxY > 0) {
      const y0 = Math.round(toScreenY(0)) + 0.5;
      context.moveTo(0, y0);
      context.lineTo(width, y0);
    }
    if (view.minX < 0 && view.maxX > 0) {
      const x0 = Math.round(toScreenX(0)) + 0.5;
      context.moveTo(x0, 0);
      context.lineTo(x0, height);
    }
    context.stroke();

    // ---- numbers along the axes
    context.fillStyle = muted;
    const axisY = view.minY < 0 && view.maxY > 0 ? toScreenY(0) : height;
    const axisX = view.minX < 0 && view.maxX > 0 ? toScreenX(0) : 0;
    context.textAlign = "center";
    context.textBaseline = "top";
    for (let x = Math.ceil(view.minX / stepX) * stepX; x <= view.maxX; x += stepX) {
      if (Math.abs(x) < stepX / 1000) continue; // skip 0, it would sit on the axis
      const sx = toScreenX(x);
      // Centred text at the very edge gets half cut off, and a chopped
      // "-10" reading as "0" is worse than no label at all.
      if (sx < 20 || sx > width - 20) continue;
      context.fillText(label(x, stepX), sx, Math.min(axisY + 4, height - 14));
    }
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let y = Math.ceil(view.minY / stepY) * stepY; y <= view.maxY; y += stepY) {
      if (Math.abs(y) < stepY / 1000) continue;
      const sy = toScreenY(y);
      if (sy < 10 || sy > height - 10) continue;
      context.fillText(label(y, stepY), Math.max(axisX - 6, 34), sy);
    }

    // ---- the curves
    const saved = shared.env.variables.get("x");
    const tall = (view.maxY - view.minY) * 4; // what counts as "off the chart"

    for (const curve of curves) {
      if (curve.tree === null) continue;
      context.strokeStyle = curve.colour;
      context.lineWidth = 2;
      context.beginPath();

      let drawing = false;
      let lastY = 0;
      for (let px = 0; px <= width; px++) {
        const x = view.minX + (px / width) * (view.maxX - view.minX);
        shared.env.variables.set("x", x);

        let y: number;
        try {
          y = evaluate(curve.tree, shared.env);
        } catch {
          drawing = false; // a hole in the function: stop the line
          continue;
        }
        if (!Number.isFinite(y)) {
          drawing = false;
          continue;
        }

        const sy = toScreenY(y);
        // A jump this big between neighbouring pixels isn't a steep line,
        // it's a break — tan at 90, or 1/x at 0. Don't join them.
        if (drawing && Math.abs(y - lastY) > tall) drawing = false;

        if (drawing) context.lineTo(px, sy);
        else {
          context.moveTo(px, sy);
          drawing = true;
        }
        lastY = y;
      }
      context.stroke();
    }

    // Put x back exactly as it was, so drawing a graph never changes what
    // the calculator thinks x is.
    if (saved === undefined) shared.env.variables.delete("x");
    else shared.env.variables.set("x", saved);
  }

  // ---- the list of curves --------------------------------------------------

  function reparse(curve: Curve): void {
    curve.error = null;
    curve.tree = null;
    const text = curve.text.trim().replace(/^y\s*=\s*/i, "");
    if (text === "") return;
    try {
      curve.tree = parse(text);
    } catch (err) {
      curve.error = (err as Error).message;
    }
  }

  function addCurve(text: string): void {
    const colour = COLOURS[curves.length % COLOURS.length];
    const input = el("input", {
      type: "text",
      class: "curve-input",
      placeholder: "x^2 - 3",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": "Expression in x",
    });
    input.value = text;

    const dot = el("span", { class: "curve-dot" });
    dot.style.setProperty("--dot", colour);
    const remove = el("button", { class: "chip-x", type: "button", "aria-label": "Remove" }, ["×"]);
    const problem = el("div", { class: "curve-error" });
    problem.hidden = true;

    const row = el("div", { class: "curve-row" }, [
      el("div", { class: "curve-line" }, [dot, el("span", { class: "curve-y" }, ["y ="]), input, remove]),
      problem,
    ]);

    const curve: Curve = { text, colour, tree: null, error: null, row };
    curves.push(curve);
    reparse(curve);

    function refresh(): void {
      curve.text = input.value;
      reparse(curve);
      problem.hidden = curve.error === null;
      problem.textContent = curve.error ?? "";
      draw();
    }
    input.addEventListener("input", refresh);

    remove.addEventListener("click", () => {
      const at = curves.indexOf(curve);
      if (at !== -1) curves.splice(at, 1);
      row.remove();
      draw();
    });

    list.append(row);
    problem.hidden = curve.error === null;
    problem.textContent = curve.error ?? "";
  }

  const add = el("button", { class: "ghost small", type: "button" }, ["Add a line"]);
  add.addEventListener("click", () => {
    addCurve("");
    draw();
    (list.querySelector(".curve-row:last-child input") as HTMLInputElement | null)?.focus();
  });

  // ---- moving around -------------------------------------------------------

  function zoom(by: number, atX?: number, atY?: number): void {
    const centreX = atX ?? (view.minX + view.maxX) / 2;
    const centreY = atY ?? (view.minY + view.maxY) / 2;
    view.minX = centreX + (view.minX - centreX) * by;
    view.maxX = centreX + (view.maxX - centreX) * by;
    view.minY = centreY + (view.minY - centreY) * by;
    view.maxY = centreY + (view.maxY - centreY) * by;
    draw();
  }

  const zoomIn = el("button", { class: "ghost small", type: "button", "aria-label": "Zoom in" }, ["+"]);
  const zoomOut = el("button", { class: "ghost small", type: "button", "aria-label": "Zoom out" }, ["−"]);
  const reset = el("button", { class: "ghost small", type: "button" }, ["Reset"]);
  zoomIn.addEventListener("click", () => zoom(0.8));
  zoomOut.addEventListener("click", () => zoom(1.25));
  reset.addEventListener("click", () => {
    Object.assign(view, START);
    draw();
  });

  // Drag to pan.
  let dragging = false;
  let fromX = 0;
  let fromY = 0;
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    fromX = event.offsetX;
    fromY = event.offsetY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    const box = canvas.getBoundingClientRect();
    const perPixelX = (view.maxX - view.minX) / box.width;
    const perPixelY = (view.maxY - view.minY) / box.height;

    if (!dragging) {
      // Not dragging: say where the pointer is, which is what people
      // actually want a graph to tell them.
      const x = view.minX + event.offsetX * perPixelX;
      const y = view.maxY - event.offsetY * perPixelY;
      readout.textContent = `x = ${x.toFixed(2)}   y = ${y.toFixed(2)}`;
      readout.hidden = false;
      return;
    }

    const dx = (event.offsetX - fromX) * perPixelX;
    const dy = (event.offsetY - fromY) * perPixelY;
    view.minX -= dx;
    view.maxX -= dx;
    view.minY += dy;
    view.maxY += dy;
    fromX = event.offsetX;
    fromY = event.offsetY;
    draw();
  });
  const stop = (event: PointerEvent) => {
    dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", () => {
    readout.hidden = true;
  });

  // Scroll to zoom, centred on the pointer so the point under it stays put.
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      const x = view.minX + (event.offsetX / box.width) * (view.maxX - view.minX);
      const y = view.maxY - (event.offsetY / box.height) * (view.maxY - view.minY);
      zoom(event.deltaY > 0 ? 1.12 : 0.89, x, y);
    },
    { passive: false },
  );

  // The window changing size changes the canvas's size, so redraw.
  const watcher = new ResizeObserver(() => draw());
  watcher.observe(canvas);

  const box = el("section", { class: "card graph-card" }, [
    el("div", { class: "calc-head" }, [
      el("h2", {}, ["Graph"]),
      zoomOut,
      zoomIn,
      reset,
    ]),
    el("div", { class: "graph-wrap" }, [canvas, readout]),
    list,
    add,
    el("p", { class: "subtitle" }, [
      "Drag to move, scroll to zoom. Anything the calculator knows works here — " +
        "set a = 2 in the calculator and you can draw a*x^2.",
    ]),
  ]);

  host.append(box);
  addCurve("x^2 - 3");
  shared.whenShown(() => draw());
}
