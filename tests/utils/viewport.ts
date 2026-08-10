import { vi } from 'vitest'

/**
 * A `matchMedia` stub that actually models a viewport width.
 *
 * jsdom has no layout, so a naive stub returning `matches: false` for everything reports
 * "narrower than every breakpoint" — i.e. every component test silently runs in the mobile
 * layout. That is how a responsive branch ends up untested in one direction while the suite
 * stays green.
 *
 * Tests default to desktop and opt into narrower widths explicitly.
 */

export const DESKTOP_WIDTH = 1280
export const TABLET_WIDTH = 768
export const MOBILE_WIDTH = 375

let currentWidth = DESKTOP_WIDTH
let currentPrefersDark = false

/** Parses the queries this app actually uses: width breakpoints and the colour scheme. */
function evaluate(query: string, width: number): boolean {
  if (query.includes('prefers-color-scheme: dark')) return currentPrefersDark
  if (query.includes('prefers-color-scheme: light')) return !currentPrefersDark

  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  if (min?.[1]) return width >= Number(min[1])

  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (max?.[1]) return width <= Number(max[1])

  return false
}

export function installMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: evaluate(query, currentWidth),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

/**
 * Sets the width subsequent `matchMedia` calls are evaluated against.
 *
 * Call it *before* rendering: the stub is read at composable-setup time, and there is no
 * layout engine to trigger a resize event.
 */
export function setViewportWidth(width: number): void {
  currentWidth = width
  installMatchMedia()
}

/** Sets what the OS-level colour-scheme query answers. */
export function setPrefersDark(value: boolean): void {
  currentPrefersDark = value
  installMatchMedia()
}

export function resetViewportWidth(): void {
  currentWidth = DESKTOP_WIDTH
  currentPrefersDark = false
}
