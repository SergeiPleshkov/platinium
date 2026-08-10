import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import type { UserConfig } from 'vite'

/*
 * Exported as a plain object rather than through `defineConfig` so `vitest.config.ts` can
 * merge it without wrestling the union type that `defineConfig` returns. `satisfies` keeps
 * full type checking and editor completion.
 */
const config = {
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind on all interfaces so the container-hosted dev server is reachable.
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    // Surface bundle regressions early rather than at review time.
    chunkSizeWarningLimit: 600,
    sourcemap: true,
  },
} satisfies UserConfig

export default config
