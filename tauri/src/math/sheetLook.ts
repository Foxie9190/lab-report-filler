/**
 * What a sheet looks like, and whose it is.
 *
 * The preview on screen and the .docx on disk have to agree about the theme,
 * the font and the name at the top. Asking the same question in two places is
 * exactly how the two drift apart, so both ask here.
 *
 * All of it is remembered from the Lab report tab: pick a theme for your
 * reports and your maths sheets follow it, without this file knowing anything
 * about that form.
 */

import { CUSTOM, THEMES, customTheme, defaultDocxOptions } from "../backend/exportDocx";
import type { DocxOptions, Theme } from "../backend/exportDocx";
import type { SheetWho } from "../backend/math/sheet";

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // No storage — the defaults below are perfectly good.
    return null;
  }
}

/** The Word options a sheet is written with. */
export function sheetOptions(): DocxOptions {
  const fallback = defaultDocxOptions();
  return {
    ...fallback,
    theme: remembered("labfiller.docTheme") ?? fallback.theme,
    font: remembered("labfiller.docFont") ?? fallback.font,
    customColor: remembered("labfiller.docColor") ?? undefined,
  };
}

/** The six colours those options mean, for the preview's CSS variables. */
export function sheetTheme(options: DocxOptions): Theme {
  if (options.theme === CUSTOM && options.customColor !== undefined) {
    return customTheme(options.customColor);
  }
  return THEMES[options.theme] ?? THEMES.Teal;
}

/** The name and class printed under the title. */
export function sheetWho(): SheetWho {
  return {
    name: remembered("labfiller.studentName") ?? "",
    course: remembered("labfiller.studentCourse") ?? "",
  };
}
