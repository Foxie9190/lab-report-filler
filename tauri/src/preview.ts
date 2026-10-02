/**
 * The live page view: the document, drawn as you type.
 *
 * This is the HTML renderer half of the split described in models.ts. It
 * never looks at a LabReport — it walks Block[] from buildDocument(), so it
 * cannot disagree with the Word file about what goes in the report. It only
 * decides how each block LOOKS.
 *
 * The paper is a real Letter sheet: 8.5in wide with 1in margins, which is
 * 816 CSS pixels wide (a CSS inch is always 96px, on every screen). Sizes
 * are in points, matching the half-point sizes exportDocx.ts uses — Word's
 * `size: 22` is 11pt here. Courier New, because that's the document's font.
 *
 * Zooming is one `transform: scale()` on the sheet. A scaled element still
 * takes up its unscaled space in the layout, so `.paper-fit` around it is
 * given the scaled size in pixels after every render — otherwise the
 * scrollbars would be for the full-size sheet no matter what you zoomed to.
 */

import type { Block, LabReport } from "./backend/models";
import type { Theme } from "./backend/exportDocx";
import type { DocumentOptions } from "./backend/document";
import { buildDocument } from "./backend/document";
import { buildReport } from "./backend/report";
import { el } from "./ui";

/** Everything the pane needs to draw itself. main.ts supplies this. */
export interface PreviewInputs {
  report: LabReport;
  theme: Theme;
  /** The Word theme's name, just for the caption under the sheet. */
  themeName: string;
  stripedRows: boolean;
  docOptions: DocumentOptions;
}

// A Letter page in CSS pixels, and the content height once 1in margins are
// taken off the top and bottom. The page-break markers are drawn every
// CONTENT_HEIGHT down the sheet.
const PAGE_WIDTH = 8.5 * 96;
const CONTENT_HEIGHT = 9 * 96;

const ZOOM_KEY = "labfiller.previewZoom";
const MODE_KEY = "labfiller.previewMode";
const SHOW_KEY = "labfiller.previewShown";
const WIDTH_KEY = "labfiller.previewWidth";

// localStorage throws in a private window, so every touch is wrapped.
function stored(key: string): string | null {
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
    /* not fatal — the choice just won't survive a restart */
  }
}

/**
 * Which part of the form a block belongs to, so focusing a field can bring
 * that part of the page into view. Headings are the landmarks; anything
 * above the first heading is the header.
 */
const SECTION_OF: Record<string, string> = {
  "Material List": "materials",
  "Safety Precautions": "materials",
  Data: "data",
  Calculations: "calculations",
  "Analysis Questions": "analysis",
};

// ---------------------------------------------------------------------------
// One block -> one element
// ---------------------------------------------------------------------------

function renderBlock(block: Block, striped: boolean): HTMLElement {
  switch (block.kind) {
    case "title":
      return el("h1", { class: "p-title" }, [block.text]);

    case "byline":
      return el("p", { class: "p-byline" }, [block.text]);

    case "labeled":
      return el("p", { class: "p-line" }, [
        el("strong", {}, [block.label]),
        block.text,
      ]);

    case "heading":
      return el("h2", { class: "p-heading" }, [block.text]);

    case "bullets":
      return el(
        "ul",
        { class: "p-bullets" },
        block.items.map((item) => el("li", {}, [item])),
      );

    case "caption":
      return el("p", { class: "p-caption" }, [block.text]);

    case "table": {
      const head = el("tr", {}, block.headers.map((h) => el("th", {}, [h])));
      const body = el(
        "tbody",
        {},
        block.rows.map((row, r) =>
          el(
            "tr",
            { class: striped && r % 2 === 1 ? "striped" : "" },
            row.map((cell) => el("td", {}, [cell])),
          ),
        ),
      );
      return el("table", { class: "p-table" }, [
        el("thead", {}, [head]),
        body,
      ]);
    }

    case "calc": {
      const box = el("div", { class: "p-calc" }, [
        el("div", { class: "p-calc-name" }, [block.name]),
      ]);
      if (block.formula !== "") {
        box.append(el("div", { class: "p-calc-formula" }, [block.formula]));
      }
      if (block.work !== "") {
        box.append(
          el("div", { class: "p-calc-work" }, [
            el("strong", {}, ["Work: "]),
            block.work,
          ]),
        );
      }
      box.append(
        el("div", { class: "p-calc-answer" }, [
          el("strong", {}, ["Answer: "]),
          el("span", { class: "p-answer-value" }, [block.answer]),
        ]),
      );
      return box;
    }

    case "question": {
      const box = el("div", { class: "p-question" }, [
        el("p", { class: "p-q" }, [
          el("span", { class: "p-num" }, [`${block.number}.`]),
          block.question,
        ]),
      ]);
      for (const line of block.answer) {
        box.append(el("p", { class: "p-a" }, [line]));
      }
      if (block.unanswered) {
        box.append(el("p", { class: "p-a p-unanswered" }, ["(not answered)"]));
      }
      return box;
    }

    case "gap":
      return el("div", { class: "p-gap" });
  }
}

/** Every block, in order, with each one tagged with its form section. */
function renderBlocks(blocks: Block[], striped: boolean): HTMLElement[] {
  let section = "header";
  return blocks.map((block) => {
    if (block.kind === "heading") section = SECTION_OF[block.text] ?? section;
    const node = renderBlock(block, striped);
    node.dataset.section = section;
    return node;
  });
}

// ---------------------------------------------------------------------------
// The pane
// ---------------------------------------------------------------------------

export interface Preview {
  /** Redraw from the current state. Debounced — safe to call per keystroke. */
  refresh(): void;
  /** Bring one section of the page into view, e.g. "calculations". */
  reveal(section: string): void;
}

/**
 * Build the pane inside #preview-col and wire its controls.
 *
 * `read` is called on every redraw rather than the values being passed in
 * once, because the theme and the checkboxes live in main.ts's form and
 * change under us.
 */
export function setUpPreview(read: () => PreviewInputs): Preview {
  const foundCol = document.getElementById("preview-col");
  const foundSplit = document.getElementById("report-split");
  // No pane in the page means no preview. Every caller can still call
  // refresh() — it just does nothing.
  if (foundCol === null || foundSplit === null) {
    return { refresh: () => {}, reveal: () => {} };
  }
  const col: HTMLElement = foundCol;
  const split: HTMLElement = foundSplit;

  // ---- the controls along the top -----------------------------------------
  const pageTab = el("button", { class: "seg", type: "button" }, ["Page"]);
  const mdTab = el("button", { class: "seg", type: "button" }, ["Markdown"]);
  const modes = el("div", { class: "segs", role: "tablist" }, [pageTab, mdTab]);

  const zoomOut = el("button", { class: "icon-btn", type: "button", title: "Zoom out", "aria-label": "Zoom out" }, ["−"]);
  const zoomIn = el("button", { class: "icon-btn", type: "button", title: "Zoom in", "aria-label": "Zoom in" }, ["+"]);
  const zoomLabel = el("button", { class: "zoom-label", type: "button", title: "Fit the page to the window" }, ["Fit"]);
  const zoomBox = el("div", { class: "zoom" }, [zoomOut, zoomLabel, zoomIn]);

  const pageCount = el("span", { class: "page-count" });
  const hide = el("button", { class: "icon-btn", type: "button", title: "Hide the preview", "aria-label": "Hide the preview" }, ["›"]);

  const head = el("div", { class: "preview-head" }, [
    modes,
    pageCount,
    el("span", { class: "spacer" }),
    zoomBox,
    hide,
  ]);

  // ---- the sheet ----------------------------------------------------------
  const body = el("div", { class: "paper-body" });
  const paper = el("article", { class: "paper" }, [body]);
  const fit = el("div", { class: "paper-fit" }, [paper]);
  const markdown = el("pre", { class: "preview md-view" });
  const scroll = el("div", { class: "paper-scroll" }, [fit, markdown]);
  const grip = el("div", { class: "splitter", role: "separator", "aria-orientation": "vertical", title: "Drag to resize" });

  col.replaceChildren(grip, head, scroll);

  // ---- mode: page or markdown ---------------------------------------------
  let mode: "page" | "markdown" = stored(MODE_KEY) === "markdown" ? "markdown" : "page";

  function applyMode(): void {
    const page = mode === "page";
    fit.hidden = !page;
    markdown.hidden = page;
    zoomBox.hidden = !page;
    pageCount.hidden = !page;
    pageTab.setAttribute("aria-selected", String(page));
    mdTab.setAttribute("aria-selected", String(!page));
    remember(MODE_KEY, mode);
  }

  pageTab.addEventListener("click", () => {
    mode = "page";
    applyMode();
    draw();
  });
  mdTab.addEventListener("click", () => {
    mode = "markdown";
    applyMode();
    draw();
  });

  // ---- zoom ---------------------------------------------------------------
  // "fit" means "recompute from the pane width", so dragging the splitter
  // keeps the whole width of the page in view. A number means the person
  // picked it and we leave it alone.
  const savedZoom = stored(ZOOM_KEY);
  let zoom: number | "fit" =
    savedZoom !== null && savedZoom !== "fit" && Number.isFinite(Number(savedZoom))
      ? Number(savedZoom)
      : "fit";

  /** The scale actually used: the fit value when fitting, else the picked one. */
  function scale(): number {
    if (zoom !== "fit") return zoom;
    // 28px of breathing room either side of the sheet.
    const room = scroll.clientWidth - 56;
    if (room <= 0) return 1;
    return Math.min(Math.max(room / PAGE_WIDTH, 0.35), 1);
  }

  function setZoom(next: number | "fit"): void {
    zoom = next === "fit" ? "fit" : Math.min(Math.max(next, 0.35), 1.6);
    remember(ZOOM_KEY, String(zoom));
    applyScale();
  }

  zoomOut.addEventListener("click", () => setZoom(scale() - 0.1));
  zoomIn.addEventListener("click", () => setZoom(scale() + 0.1));
  zoomLabel.addEventListener("click", () => setZoom("fit"));

  /** Scale the sheet, then hand `.paper-fit` the size it now takes up. */
  function applyScale(): void {
    const z = scale();
    paper.style.transform = `scale(${z})`;
    fit.style.width = `${PAGE_WIDTH * z}px`;
    fit.style.height = `${paper.offsetHeight * z}px`;
    zoomLabel.textContent = zoom === "fit" ? "Fit" : `${Math.round(z * 100)}%`;
  }

  // ---- page breaks --------------------------------------------------------
  /*
   * Word decides its own page breaks, and we are not Word — a line that sits
   * right on the boundary may land on either side. These markers are an
   * honest estimate: content is measured from the top of the text area and a
   * line is drawn every 9 inches, which is how much of a Letter page is left
   * after 1in margins.
   */
  function drawBreaks(): void {
    for (const old of body.querySelectorAll(".page-break")) old.remove();
    const height = body.scrollHeight;
    const pages = Math.max(Math.ceil(height / CONTENT_HEIGHT), 1);
    for (let i = 1; i < pages; i++) {
      const mark = el("div", { class: "page-break" }, [
        el("span", {}, [`Page ${i + 1}`]),
      ]);
      mark.style.top = `${i * CONTENT_HEIGHT}px`;
      body.append(mark);
    }
    // The sheet ends on a page boundary rather than wherever the text ran
    // out: that's the 9in of text area per page, plus the 1in margin at the
    // very top and the 1in at the very bottom.
    paper.style.minHeight = `${pages * 9 + 2}in`;
    pageCount.textContent = pages === 1 ? "1 page" : `${pages} pages`;
  }

  // ---- drawing ------------------------------------------------------------
  function draw(): void {
    const { report, theme, themeName, stripedRows, docOptions } = read();

    if (mode === "markdown") {
      markdown.textContent = buildReport(report);
      return;
    }

    // The document's own colours, handed to the CSS as variables.
    paper.style.setProperty("--doc-accent", `#${theme.accent}`);
    paper.style.setProperty("--doc-dark", `#${theme.dark}`);
    paper.style.setProperty("--doc-light", `#${theme.light}`);
    paper.style.setProperty("--doc-box", `#${theme.box}`);
    paper.style.setProperty("--doc-ink", `#${theme.ink}`);
    paper.style.setProperty("--doc-muted", `#${theme.muted}`);
    paper.title = `Letter page, ${themeName} theme`;

    const blocks = buildDocument(report, docOptions);
    body.replaceChildren(...renderBlocks(blocks, stripedRows));
    drawBreaks();
    applyScale();
  }

  // Typing fires an input event per letter; drawing once per letter is waste.
  // One frame's delay is far too short to notice and coalesces a fast typist
  // into a single redraw.
  let pending: number | undefined;
  function refresh(): void {
    if (col.hidden) return; // nothing to draw while the pane is closed
    window.clearTimeout(pending);
    pending = window.setTimeout(draw, 90);
  }

  // ---- show / hide --------------------------------------------------------
  // On a wide window this is the side-by-side preview; on a narrow one the
  // stylesheet turns the same state into a full-screen page view, so the
  // button reads as "flip to the page" there. One state, two layouts.
  const toggle = document.getElementById("preview-toggle");
  let shown = stored(SHOW_KEY) !== "off";

  function applyShown(): void {
    col.hidden = !shown;
    split.dataset.preview = shown ? "on" : "off";
    toggle?.setAttribute("aria-pressed", String(shown));
    remember(SHOW_KEY, shown ? "on" : "off");
    if (shown) draw();
  }

  hide.addEventListener("click", () => {
    shown = false;
    applyShown();
  });
  toggle?.addEventListener("click", () => {
    shown = !shown;
    applyShown();
  });

  // ---- the drag handle ----------------------------------------------------
  // The width lives in a CSS variable on the column, so the stylesheet keeps
  // control of the minimum and maximum.
  const savedWidth = Number(stored(WIDTH_KEY));
  if (Number.isFinite(savedWidth) && savedWidth > 0) {
    col.style.setProperty("--preview-width", `${savedWidth}px`);
  }

  grip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    const area = split.getBoundingClientRect();
    document.body.classList.add("dragging");

    const move = (e: PointerEvent): void => {
      // Dragging left widens the preview: it's the right-hand column.
      const width = Math.min(
        Math.max(area.right - e.clientX, 320),
        Math.max(area.width - 380, 320),
      );
      col.style.setProperty("--preview-width", `${width}px`);
      remember(WIDTH_KEY, String(Math.round(width)));
      if (zoom === "fit") applyScale();
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      document.body.classList.remove("dragging");
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });

  // Fitting depends on how wide the pane is, so a window resize re-fits.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (!col.hidden) applyScale();
    }).observe(scroll);
  }

  /** Scroll the sheet so a section is in view, if it isn't already. */
  function reveal(section: string): void {
    if (col.hidden || mode !== "page") return;
    const target = body.querySelector<HTMLElement>(`[data-section="${section}"]`);
    if (!target) return;
    // Measured rather than calculated: getBoundingClientRect already has the
    // zoom scaling baked in, so this needs no maths of its own.
    const box = target.getBoundingClientRect();
    const view = scroll.getBoundingClientRect();
    if (box.top >= view.top && box.bottom <= view.bottom) return; // already there
    const top = scroll.scrollTop + (box.top - view.top) - 40;
    scroll.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  }

  applyMode();
  applyShown();
  return { refresh, reveal };
}
