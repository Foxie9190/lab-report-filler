/// <reference types="vite/client" />

/**
 * The build settings this app reads. Declared so TypeScript knows
 * import.meta.env.VITE_API_URL is a string, not "anything".
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
