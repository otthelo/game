/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** HTTP endpoint of the Colyseus server, e.g. http://localhost:2567 */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
