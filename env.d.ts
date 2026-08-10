/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path the mock API is served under. Defaults to `/api`. */
  readonly VITE_API_BASE_URL?: string
  /** Set to `'false'` to boot without the MSW worker. Defaults to enabled. */
  readonly VITE_ENABLE_MOCK_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
