import { computed, ref, type ComputedRef } from 'vue'
import type { Router } from 'vue-router'

/**
 * Whether a route navigation is currently in flight.
 *
 * Route components are lazy-loaded, so navigating to a view for the first time means fetching
 * a JavaScript chunk over the network. Until it arrives the router does not swap the outlet
 * the old page stays on screen and the click appears to have done nothing. On a fast
 * connection that is invisible; on a slow one it reads as a broken button.
 *
 * Module-level so the indicator can live anywhere in the tree without prop-drilling, in the
 * same shape as `useTheme` and `useSidebar`.
 */

/**
 * How long a navigation may take before the overlay appears.
 *
 * An already-downloaded chunk resolves in a few milliseconds. Showing a spinner for those
 * would flash on every click, noise that reads as jank rather than as feedback. The threshold
 * means the overlay only appears when there is genuinely something to wait for.
 */
const VISIBILITY_DELAY_MS = 150

const isNavigating = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined

function begin(): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    isNavigating.value = true
  }, VISIBILITY_DELAY_MS)
}

function end(): void {
  clearTimeout(timer)
  timer = undefined
  isNavigating.value = false
}

export interface UseRouteLoading {
  isNavigating: ComputedRef<boolean>
}

export function useRouteLoading(): UseRouteLoading {
  return { isNavigating: computed(() => isNavigating.value) }
}

/**
 * Wires the tracker to a router. Called once per router instance.
 *
 * Deliberately *not* reference-counted. A redirect (an unauthenticated user bounced to the
 * login page) is two navigations, and a counter that misses one `afterEach` would leave the
 * overlay up forever over a page that is never going to change. Restarting a single timer
 * cannot get stuck: every `begin` clears the previous one, and every terminal hook clears it
 * outright. The cost is that a redirect restarts the 150ms delay, which nobody can perceive.
 *
 * `onError` matters as much as `afterEach`: a chunk that fails to load, a stale hash after a
 * deploy is the usual cause, rejects the navigation without ever completing it.
 */
export function trackRouteLoading(router: Router): void {
  router.beforeEach(() => {
    begin()
    return true
  })
  router.afterEach(() => end())
  router.onError(() => end())
}

/** Test-only: returns the module to its default state. */
export function resetRouteLoading(): void {
  end()
}
