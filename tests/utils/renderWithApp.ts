import { render, type RenderResult } from '@testing-library/vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { installPrimeVue } from '@/app/plugins/primevue'
import { registerGuards } from '@/app/router/guards'
import { routes } from '@/app/router/routes'
import { useAuthStore } from '@/features/auth'
import { configureHttp } from '@/shared/api'
import { trackRouteLoading } from '@/shared/composables'

export interface RenderWithAppOptions {
  props?: Record<string, unknown>
  attrs?: Record<string, unknown>
  slots?: Record<string, string>
  /** Path to start at. Defaults to `/`. */
  initialRoute?: string
  /** Register the navigation guards. Off by default so component tests stay unaffected. */
  withGuards?: boolean
}

export type RenderWithAppResult = RenderResult & { router: Router; pinia: Pinia }

/**
 * Mounts a component inside the real application context: a fresh Pinia, a real router on a
 * memory history, the real PrimeVue registration, and the HTTP client wired to that Pinia's
 * auth store exactly as `main.ts` wires it.
 *
 * Deliberately no stubs. Tests that run against the genuine wiring catch integration mistakes
 * a stubbed mount would hide, and they keep passing when the UI kit is swapped, because they
 * assert on roles and text rather than component internals.
 */
export async function renderWithApp(
  component: Component,
  options: RenderWithAppOptions = {},
): Promise<RenderWithAppResult> {
  const pinia = createPinia()
  setActivePinia(pinia)

  // A per-test router instance, so navigation state never leaks between cases.
  const router = createRouter({ history: createMemoryHistory(), routes })
  // Matches `createAppRouter`: the tracker goes on before any guard that could redirect.
  trackRouteLoading(router)
  if (options.withGuards) registerGuards(router)

  const auth = useAuthStore(pinia)
  configureHttp({
    baseUrl: `${window.location.origin}/api`,
    getAuthToken: () => auth.token,
    onUnauthorized: () => auth.endExpiredSession(),
  })

  await router.push(options.initialRoute ?? '/')
  await router.isReady()

  const utils = render(component, {
    ...(options.props ? { props: options.props } : {}),
    ...(options.attrs ? { attrs: options.attrs } : {}),
    ...(options.slots ? { slots: options.slots } : {}),
    global: {
      plugins: [pinia, router, installPrimeVue],
    },
  })

  return Object.assign(utils, { router, pinia })
}
