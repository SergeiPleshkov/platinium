import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/vue'
import { afterEach, beforeAll, vi } from 'vitest'

/**
 * Global test environment.
 *
 * The MSW node server is registered here in phase 2 — one mock backend shared by the browser
 * and the test runner, so tests exercise the same request handling the app does.
 */

/**
 * Some suites (the architecture tests, for one) opt into the `node` environment and have no
 * DOM. This setup file is global, so every DOM touch below is guarded.
 */
const hasDom = typeof document !== 'undefined'

beforeAll(() => {
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
  if (!hasDom) return

  cleanup()
  document.documentElement.classList.remove('dark')
})
