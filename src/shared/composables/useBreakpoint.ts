import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

/**
 * The single place `matchMedia` is read.
 *
 * Layout decisions that cannot be expressed in CSS — rendering a card list instead of a
 * table, or a drawer instead of a sidebar — need the breakpoint in JavaScript. Scattering
 * `window.innerWidth` checks would mean N listeners, N cleanup bugs, and N chances to
 * disagree with Tailwind about where `md` starts.
 *
 * Widths match Tailwind's defaults so JS and CSS can never disagree.
 */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export type BreakpointName = keyof typeof BREAKPOINTS

export interface UseBreakpoint {
  /** True at or above the given width. */
  matches: Ref<boolean>
}

export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)

  // jsdom and SSR have no matchMedia; defaulting to false is the safe, mobile-first answer.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches
  }

  const media = window.matchMedia(query)
  matches.value = media.matches

  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches
  }

  media.addEventListener('change', onChange)
  // Composables must be safe to call outside a component, hence `onScopeDispose`.
  onScopeDispose(() => media.removeEventListener('change', onChange))

  return matches
}

export function useBreakpoint(name: BreakpointName): UseBreakpoint {
  return { matches: useMediaQuery(`(min-width: ${BREAKPOINTS[name]}px)`) }
}

export interface UseResponsiveLayout {
  isMobile: ComputedRef<boolean>
  isTablet: ComputedRef<boolean>
  isDesktop: ComputedRef<boolean>
}

/** The three bands the portal's layout actually branches on. */
export function useResponsiveLayout(): UseResponsiveLayout {
  const atMd = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`)
  const atLg = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`)

  return {
    isMobile: computed(() => !atMd.value),
    isTablet: computed(() => atMd.value && !atLg.value),
    isDesktop: computed(() => atLg.value),
  }
}
