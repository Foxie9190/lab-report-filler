/**
 * The graph, drawn for paper.
 *
 * Not a screenshot of the one on screen. That one is drawn for a dark
 * window: pale lines on a near-black background, sized to a pane, at
 * whatever zoom you left it. Printed, it would come out as a black rectangle
 * using half a cartridge.
 *
 * So this draws it again — white background, dark axes, thicker lines, at
 * twice the final size so it stays sharp on paper — and hands back PNG bytes
 * that go straight into the document as an ImageBlock.
 */

import { evaluate, newEnv } from "../backend/math/evaluate";
import type { MathEnv } from "../backend/math/evaluate";
import { parse } from "../backend/math/parse";
import type { Node } from "../backend/math/parse";
import type { MathPage } from "../backend/math/page";

/** Ink for paper: dark enough to photocopy, distinct in black and white. */
const COLOURS = ["#1D4ED8", "#047857", "#B45309", "#6D28D9", "#B91C1C"];

/**
 * A dash pattern per line, matching the colours above.
 *
 * Colour alone isn't enough on a sheet that gets photocopied — four
 * different colours come out as four nearly identical greys. The pattern
 * survives that, so the key still works in black and white.
 */
const DASHES: number[][] = [[], [10, 6], [2, 5], [12, 4, 2, 4], [6, 3]];

export interface PictureSize {
  /** Printed size, in pixels at 96 per inch. 624 is the full text width. */
  width: number;
  height: number;
}

export const SHEET_PICTURE: PictureSize = { width: 560, height: 360 };

/** A step that lands on 1, 2 or 5 times a power of ten, like graph paper. */
function niceStep(range: number, target: number): number {
  const rough = range / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const step of [1, 2, 5, 10]) {
    if (rough <= step * power) return step * power;
  }
  return 10 * power;
}

function label(value: number, step: number): string {
  const places = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(places);
}

/** Work out a y range that fits the curves, ignoring the parts that run away. */
function fitY(trees: Node[], env: MathEnv, minX: number, maxX: number): [number, number] {
  const values: number[] = [];
  const saved = env.variables.get("x");
  for (const tree of trees) {
    for (let i = 0; i <= 200; i++) {
      env.variables.set("x", minX + ((maxX - minX) * i) / 200);
      try {
        const y = evaluate(tree, env);
        if (Number.isFinite(y)) values.push(y);
      } catch {
        // An x this function has no answer for. Skip it.
      }
    }
  }
  if (saved === undefined) env.variables.delete("x");
  else env.variables.set("x", saved);

  if (values.length === 0) return [-10, 10];
  values.sort((a, b) => a - b);
  // Trim the extremes: one asymptote shooting off to a million would
  // otherwise squash everything else into a flat line.
  const low = values[Math.floor(values.length * 0.02)];
  const high = values[Math.floor(values.length * 0.98)];
  if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 1e-9) {
    const middle = Number.isFinite(low) ? low : 0;
    return [middle - 5, middle + 5];
  }
  const pad = (high - low) * 0.1;
  return [low - pad, high + pad];
}

/**
 * Draw the page's curves and return PNG bytes, or null if there's nothing to
 * draw or this browser can't make one.
 */
export async function graphPicture(
  page: MathPage,
  minX = -5,
  maxX = 5,
  size: PictureSize = SHEET_PICTURE,
): Promise<Uint8Array | null> {
  const drawn = page.curves.filter((curve) => curve.text.trim() !== "");
  if (drawn.length === 0) return null;

  const env = newEnv(page.degrees);
  for (const [name, value] of page.variables) env.variables.set(name, value);

  const trees: { tree: Node; colour: string; dash: number[]; label: string }[] = [];
  drawn.forEach((curve, at) => {
    try {
      trees.push({
        tree: parse(curve.text.trim()),
        colour: COLOURS[at % COLOURS.length],
        dash: DASHES[at % DASHES.length],
        label: `y = ${curve.text.trim()}`,
      });
    } catch {
      // A half-typed line. Leave it out rather than refusing the whole sheet.
    }
  });
  if (trees.length === 0) return null;

  // Twice the printed size, so the picture is still sharp on paper.
  const scale = 2;
  const width = size.width * scale;
  const height = size.height * scale;

  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) return null;

  const [minY, maxY] = fitY(trees.map((t) => t.tree), env, minX, maxX);
  const toX = (x: number) => ((x - minX) / (maxX - minX)) * width;
  const toY = (y: number) => height - ((y - minY) / (maxY - minY)) * height;

  // ---- paper
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);

  // ---- grid
  const stepX = niceStep(maxX - minX, 10);
  const stepY = niceStep(maxY - minY, 8);
  context.strokeStyle = "#D7DCE3";
  context.lineWidth = 1 * scale;
  context.beginPath();
  for (let x = Math.ceil(minX / stepX) * stepX; x <= maxX; x += stepX) {
    context.moveTo(toX(x), 0);
    context.lineTo(toX(x), height);
  }
  for (let y = Math.ceil(minY / stepY) * stepY; y <= maxY; y += stepY) {
    context.moveTo(0, toY(y));
    context.lineTo(width, toY(y));
  }
  context.stroke();

  // ---- axes
  context.strokeStyle = "#333A44";
  context.lineWidth = 1.5 * scale;
  context.beginPath();
  if (minY < 0 && maxY > 0) {
    context.moveTo(0, toY(0));
    context.lineTo(width, toY(0));
  }
  if (minX < 0 && maxX > 0) {
    context.moveTo(toX(0), 0);
    context.lineTo(toX(0), height);
  }
  context.stroke();

  // ---- numbers
  context.fillStyle = "#4A5261";
  context.font = `${11 * scale}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  const axisY = minY < 0 && maxY > 0 ? toY(0) : height;
  for (let x = Math.ceil(minX / stepX) * stepX; x <= maxX; x += stepX) {
    if (Math.abs(x) < stepX / 1000) continue;
    const sx = toX(x);
    if (sx < 20 * scale || sx > width - 20 * scale) continue;
    context.fillText(label(x, stepX), sx, Math.min(axisY + 4 * scale, height - 16 * scale));
  }
  context.textAlign = "right";
  context.textBaseline = "middle";
  const axisX = minX < 0 && maxX > 0 ? toX(0) : 0;
  for (let y = Math.ceil(minY / stepY) * stepY; y <= maxY; y += stepY) {
    if (Math.abs(y) < stepY / 1000) continue;
    const sy = toY(y);
    if (sy < 10 * scale || sy > height - 10 * scale) continue;
    context.fillText(label(y, stepY), Math.max(axisX - 6 * scale, 34 * scale), sy);
  }

  // ---- the curves
  const saved = env.variables.get("x");
  const tall = (maxY - minY) * 4;
  for (const { tree, colour, dash } of trees) {
    context.strokeStyle = colour;
    context.lineWidth = 2.5 * scale;
    context.setLineDash(dash.map((n) => n * scale));
    context.beginPath();
    let drawing = false;
    let lastY = 0;
    for (let px = 0; px <= width; px++) {
      const x = minX + (px / width) * (maxX - minX);
      env.variables.set("x", x);
      let y: number;
      try {
        y = evaluate(tree, env);
      } catch {
        drawing = false; // a hole in the function: stop the line
        continue;
      }
      if (!Number.isFinite(y)) {
        drawing = false;
        continue;
      }
      // A jump this big between neighbouring pixels is a break, not a steep
      // line — tan at 90, or 1/x at 0. Don't join them.
      if (drawing && Math.abs(y - lastY) > tall) drawing = false;
      if (drawing) context.lineTo(px, toY(y));
      else {
        context.moveTo(px, toY(y));
        drawing = true;
      }
      lastY = y;
    }
    context.stroke();
  }
  if (saved === undefined) env.variables.delete("x");
  else env.variables.set("x", saved);

  context.setLineDash([]);

  // ---- the key -------------------------------------------------------------
  // Which line is which. Drawn last so it sits over the curves, in whichever
  // corner has the least drawn through it — a key covering the interesting
  // part of a graph is worse than no key.
  drawKey(context, trees, width, height, scale, toX, toY, minX, maxX, env);

  // ---- a thin frame, so the picture has an edge on white paper
  context.strokeStyle = "#B8BFC9";
  context.lineWidth = 1 * scale;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  // ---- out as PNG bytes
  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise<Blob | null>((done) =>
          (canvas as HTMLCanvasElement).toBlob(done, "image/png"),
        );
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Draw the key, in the emptiest corner.
 *
 * "Emptiest" is worked out by sampling each curve across the picture and
 * counting how many points land in each candidate box. It's rough on
 * purpose — the only thing that matters is not putting the key on top of
 * the part of the graph someone wants to look at.
 */
function drawKey(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  trees: { tree: Node; colour: string; dash: number[]; label: string }[],
  width: number,
  height: number,
  scale: number,
  toX: (x: number) => number,
  toY: (y: number) => number,
  minX: number,
  maxX: number,
  env: MathEnv,
): void {
  const pad = 10 * scale;
  const lineHeight = 20 * scale;
  const sample = 34 * scale; // the little length of line in front of the text

  context.font = `${12 * scale}px system-ui, sans-serif`;
  const textWidth = Math.max(...trees.map((t) => context.measureText(t.label).width));
  const boxWidth = sample + 8 * scale + textWidth + pad * 2;
  const boxHeight = trees.length * lineHeight + pad * 2 - 4 * scale;

  // Where the curves actually go, so the key can avoid them.
  const points: [number, number][] = [];
  const saved = env.variables.get("x");
  for (const { tree } of trees) {
    for (let i = 0; i <= 120; i++) {
      const x = minX + ((maxX - minX) * i) / 120;
      env.variables.set("x", x);
      try {
        const y = evaluate(tree, env);
        if (Number.isFinite(y)) points.push([toX(x), toY(y)]);
      } catch {
        // no value here
      }
    }
  }
  if (saved === undefined) env.variables.delete("x");
  else env.variables.set("x", saved);

  const margin = 8 * scale;
  const corners = [
    { x: margin, y: margin },
    { x: width - boxWidth - margin, y: margin },
    { x: margin, y: height - boxHeight - margin },
    { x: width - boxWidth - margin, y: height - boxHeight - margin },
  ];
  let best = corners[0];
  let fewest = Infinity;
  for (const corner of corners) {
    const inside = points.filter(
      ([px, py]) =>
        px >= corner.x && px <= corner.x + boxWidth && py >= corner.y && py <= corner.y + boxHeight,
    ).length;
    if (inside < fewest) {
      fewest = inside;
      best = corner;
    }
  }

  // A solid white box, not a see-through one: a key you read through a
  // curve isn't a key.
  context.fillStyle = "#FFFFFF";
  context.strokeStyle = "#B8BFC9";
  context.lineWidth = 1 * scale;
  context.fillRect(best.x, best.y, boxWidth, boxHeight);
  context.strokeRect(best.x, best.y, boxWidth, boxHeight);

  context.textAlign = "left";
  context.textBaseline = "middle";
  trees.forEach((curve, at) => {
    const y = best.y + pad + at * lineHeight + lineHeight / 2 - 4 * scale;
    context.strokeStyle = curve.colour;
    context.lineWidth = 2.5 * scale;
    context.setLineDash(curve.dash.map((n) => n * scale));
    context.beginPath();
    context.moveTo(best.x + pad, y);
    context.lineTo(best.x + pad + sample, y);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#1F2530";
    context.fillText(curve.label, best.x + pad + sample + 8 * scale, y);
  });
}
