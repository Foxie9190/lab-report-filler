import { defineConfig } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  /*
   * Where the files will be served from.
   *
   * The installed app and `npm run dev` both serve from the root, so "/" is
   * right for them. GitHub Pages serves a project site from a subfolder
   * (/lab-report-filler/), and without this every link would point one level
   * too high and the page would come up blank. The Pages workflow sets
   * VITE_BASE; nothing else has to know.
   */
  base: process.env.VITE_BASE || "/",


  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
