import { render, type RenderResult } from '@testing-library/vue'
import { createPinia } from 'pinia'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { installPrimeVue } from '@/app/plugins/primevue'
import { routes } from '@/app/router/routes'

export interface RenderWithAppOptions {
  props?: Record<string, unknown>
  slots?: Record<string, string>
  /** Path to start at. Defaults to `/`. */
  initialRoute?: string
}

export type RenderWithAppResult = RenderResult & { router: Router }

/**
 * Mounts a component inside the real application context: a fresh Pinia, a real router on a
 * memory history, and the real PrimeVue registration.
 *
 * Deliberately no stubs. Tests that run against the genuine wiring catch integration
 * mistakes that a stubbed mount would hide, and they keep passing when the UI kit is
 * swapped, because they assert on roles and text rather than on component internals.
 */
export async function renderWithApp(
  component: Component,
  options: RenderWithAppOptions = {},
): Promise<RenderWithAppResult> {
  // A per-test router instance, so navigation state never leaks between cases.
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(options.initialRoute ?? '/')
  await router.isReady()

  const utils = render(component, {
    ...(options.props ? { props: options.props } : {}),
    ...(options.slots ? { slots: options.slots } : {}),
    global: {
      plugins: [createPinia(), router, installPrimeVue],
    },
  })

  return Object.assign(utils, { router })
}
