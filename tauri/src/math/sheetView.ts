/**
 * The Sheet area: the page you'd hand in, on screen.
 *
 * This draws nothing itself. buildMathSheet() turns the page into Block[] and
 * the HTML renderer in preview.ts draws those blocks — the same two halves the
 * Lab report tab uses, so the sheet on screen and the .docx can't disagree
 * about what's on it. Adding a block kind to the sheet makes it appear here
 * for free.
 *
 *   MathPage ──► buildMathSheet() ──► Block[] ──┬──► renderBlocks()  (here)
 *                                               └──► blocksToDocx()  (the file)
 *
 * It redraws every time you open the area rather than on a timer, because the
 * inner tabs only show one area at a time: nothing can change the page while
 * you're looking at this, so a redraw on arrival is always current and costs
 * nothing while you work in the other areas.
 */

import { el } from "../ui";
import { PAGE_WIDTH, dressPaper, drawPageBreaks, renderBlocks } from "../preview";
import { buildMathSheet } from "../backend/math/sheet";
import { graphPicture, SHEET_PICTURE } from "./graphImage";
import { sheetOptions, sheetTheme, sheetWho } from "./sheetLook";
import type { Shared } from "./mathTab";

export function buildSheetView(host: HTMLElement, shared: Shared): void {
  const body = el("div", { class: "paper-body" });
  const paper = el("article", { class: "paper" }, [body]);
  const fit = el("div", { class: "paper-fit" }, [paper]);
  const view = el("div", { class: "sheet-view" }, [fit]);

  const count = el("span", { class: "save-state" }, ["1 page"]);
  const note = el("p", { class: "calc-empty" });
  note.hidden = true;

  /**
   * Fit the whole width of the page into the area.
   *
   * `transform: scale()` doesn't change the space an element takes up, so the
   * wrapper is given the scaled size in pixels — otherwise the scrollbars
   * would still be for a full-size sheet.
   */
  function applyScale(): void {
    const room = view.clientWidth - 56;
    const zoom = room <= 0 ? 1 : Math.min(Math.max(room / PAGE_WIDTH, 0.35), 1);
    paper.style.transform = `scale(${zoom})`;
    fit.style.width = `${PAGE_WIDTH * zoom}px`;
    fit.style.height = `${paper.offsetHeight * zoom}px`;
  }

  // Drawing the graph means waiting for a canvas, so a second redraw can be
  // asked for while the first is still going. Same guard as the autosave.
  let drawing = false;
  let again = false;

  async function draw(): Promise<void> {
    if (drawing) {
      again = true;
      return;
    }
    drawing = true;
    try {
      const options = sheetOptions();
      dressPaper(paper, sheetTheme(options), options.font);

      // The picture is drawn by the same function the .docx uses, so what you
      // see here is the file's picture, not a screenshot of the graph screen.
      const drawn = await graphPicture(shared.page);
      const blocks = buildMathSheet(
        shared.page,
        sheetWho(),
        undefined,
        drawn === null ? null : { data: drawn, ...SHEET_PICTURE },
      );

      body.replaceChildren(...renderBlocks(blocks, options.stripedRows));
      const pages = drawPageBreaks(body, paper);
      count.textContent = pages === 1 ? "1 page" : `${pages} pages`;

      // A sheet with no headings is a title and a name and nothing else.
      const bare = !blocks.some((block) => block.kind === "heading");
      note.textContent = bare
        ? "Nothing on the sheet yet — solve an equation or draw a line and it turns up here."
        : "";
      note.hidden = !bare;

      applyScale();
    } catch (err) {
      console.error("could not draw the sheet", err);
      note.textContent = "Couldn't draw the sheet.";
      note.hidden = false;
    } finally {
      drawing = false;
      if (again) {
        again = false;
        void draw();
      }
    }
  }

  host.append(
    el("section", { class: "card" }, [
      el("div", { class: "calc-head" }, [el("h2", {}, ["Sheet"]), count]),
      el("p", { class: "subtitle" }, [
        "What Save as Word writes, before you write it. Scratch calculator lines and refused equations are left off.",
      ]),
      note,
      view,
    ]),
  );

  // Resizing the window changes how much room the page has; that's a rescale,
  // not a redraw.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => applyScale()).observe(view);
  }

  shared.whenShown(() => void draw());
}
