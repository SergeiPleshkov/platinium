import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/vue'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

import { resetMockConfig } from '@/mocks/config'
import { resetDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { installMatchMedia, resetViewportWidth } from '@tests/utils/viewport'

/**
 * Global test environment.
 *
 * The MSW node server runs the *same* handlers the browser does, so tests exercise real
 * request handling rather than a parallel set of stubs. Handlers, database and mock config
 * are all reset between tests, so no spec can be influenced by what another one did.
 */

/**
 * Some suites (the architecture tests, for one) opt into the `node` environment and have no
 * DOM. This setup file is global, so every DOM touch below is guarded.
 */
const hasDom = typeof document !== 'undefined'

beforeAll(() => {
  /*
   * `error` rather than `bypass`: an unhandled request in a test means the client is calling
   * an endpoint the mock backend does not implement, which is a bug worth failing on rather
   * than a silent network attempt.
   */
  server.listen({ onUnhandledRequest: 'error' })
})

/*
 * Re-stubbed per test, not once in `beforeAll`: `unstubGlobals` in vitest.config.ts clears
 * stubbed globals after every test, so a single up-front stub survives exactly one case and
 * then silently disappears — which surfaced as "matchMedia is not a function" the moment a
 * component used the breakpoint composable.
 */
beforeEach(() => {
  if (!hasDom) return

  /* jsdom implements neither of these, and PrimeVue's overlay components call both. */
  installMatchMedia()

  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  )
})

afterEach(() => {
  // Drop any per-test handler overrides, then restore pristine seed data and mock settings.
  resetViewportWidth()
  server.resetHandlers()
  resetDb()
  resetMockConfig()

  if (!hasDom) return

  cleanup()
  document.documentElement.classList.remove('dark')
})

afterAll(() => {
  server.close()
})
