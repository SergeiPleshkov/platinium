import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vitest/config'

// Explicit extension: Vite's native config loader requires it, and will require it by default.
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      /*
       * Dates are formatted with `Intl`, which uses the local zone. Without pinning this, a
       * range spanning midnight formats differently in CI than on a developer's machine and
       * the suite is quietly machine-dependent.
       */
      env: { TZ: 'UTC' },
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      // Integration journeys (login → list → dialog) need headroom under coverage in CI.
      testTimeout: 15_000,
      // Component styles are not asserted on; skipping them keeps runs fast.
      css: false,
      include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/**/*.spec.ts',
          'src/**/index.ts',
          'src/**/types.ts',
          'src/app/main.ts',
          'src/mocks/browser.ts',
        ],
      },
    },
  }),
)
