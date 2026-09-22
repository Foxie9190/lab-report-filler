/**
 * Saving a file to disk.
 *
 * Inside the Tauri app, a web page isn't allowed to write files by itself
 * (that's a safety feature). So we ask two Tauri plugins for help:
 *   - dialog: shows the normal "Save As" window and gives back the path
 *   - fs:     writes the bytes to that path
 * Both have to be switched on in src-tauri (Cargo.toml, lib.rs, and
 * capabilities/default.json), or the calls get refused.
 *
 * When the page is opened in a normal browser instead (npm run dev), there
 * is no Tauri, so it falls back to an ordinary browser download.
 */

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** True inside the Tauri app, false in a plain browser tab. */
function inTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** Turns a lab title into a safe file name: no / \ : * ? " < > | */
export function fileNameFor(title: string): string {
  const clean = title.replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean || "Lab Report"}.docx`;
}

/**
 * Save a .docx. Returns where it went, or null if the person pressed
 * Cancel in the Save window.
 */
export async function saveDocx(bytes: Uint8Array, suggestedName: string): Promise<string | null> {
  if (inTauri()) {
    // `await import(...)` loads the plugin code only when it's needed.
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Word document", extensions: ["docx"] }],
    });
    if (!path) return null; // cancelled
    await writeFile(path, bytes);
    return path;
  }

  // Browser fallback: make a temporary link to the bytes and click it.
  const blob = new Blob([new Uint8Array(bytes)], { type: DOCX_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}
