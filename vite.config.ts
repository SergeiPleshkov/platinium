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
    /*
     * A tripwire for bundle regressions, set just above where the shared vendor chunk
     * legitimately sits (~630 kB raw / ~150 kB gzipped: Vue, Pinia, the router, axios and
     * PrimeVue's core). Grouping the vendors into named chunks by hand was tried and reverted
     * — it pulls route-specific PrimeVue components in eagerly and made the dashboard's first
     * load 276 kB gzipped instead of 207. The default route-aware splitting wins.
     */
    chunkSizeWarningLimit: 700,
    sourcemap: true,
  },
} satisfies UserConfig

export default config
