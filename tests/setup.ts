import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/vue'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { resetMockConfig } from '@/mocks/config'
import { resetDb } from '@/mocks/db'
import { server } from '@/mocks/server'

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

  if (!hasDom) return

  /*
   * jsdom implements neither of these, and PrimeVue's overlay components call both.
   * Stubbing them here keeps the noise out of individual specs.
   */
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )

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
