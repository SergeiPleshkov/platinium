import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  resetRouteLoading,
  trackRouteLoading,
  useRouteLoading,
} from '@/shared/composables/useRouteLoading'

/**
 * The lazy-route loading indicator.
 *
 * Two claims worth pinning, and they pull against each other: a *slow* navigation must show
 * the overlay, and a *fast* one must not — a spinner that flashes on every click is noise, not
 * feedback. Fake timers are the only way to test a threshold without a sleep in the suite.
 *
 * The third claim is that it can never get stuck. An overlay left up over a page that will
 * never change is worse than no overlay, so a failed navigation is tested as well as a
 * successful one.
 */

const Blank = { template: '<div />' }

/** Resolves only when told to, so a navigation can be held open across an assertion. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function makeRouter(): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/next', component: Blank },
      { path: '/guarded', component: Blank },
    ],
  })
  trackRouteLoading(router)
  return router
}

beforeEach(() => {
  vi.useFakeTimers()
  resetRouteLoading()
})

afterEach(() => {
  vi.useRealTimers()
  resetRouteLoading()
})

describe('useRouteLoading', () => {
  it('starts idle', () => {
    makeRouter()

    expect(useRouteLoading().isNavigating.value).toBe(false)
  })

  it('stays hidden for a navigation that resolves quickly', async () => {
    const router = makeRouter()
    await router.push('/next')

    // Already-downloaded chunks resolve in a few milliseconds; a flash there is pure noise.
    vi.advanceTimersByTime(1000)
    expect(useRouteLoading().isNavigating.value).toBe(false)
  })

  it('appears once a navigation outlasts the threshold', async () => {
    const router = makeRouter()
    const gate = deferred()
    router.beforeEach(() => gate.promise.then(() => true))

    const navigation = router.push('/guarded')
    await vi.advanceTimersByTimeAsync(200)
    expect(useRouteLoading().isNavigating.value).toBe(true)

    gate.resolve()
    await navigation
    expect(useRouteLoading().isNavigating.value).toBe(false)
  })

  it('is still hidden just before the threshold', async () => {
    const router = makeRouter()
    const gate = deferred()
    router.beforeEach(() => gate.promise.then(() => true))

    void router.push('/guarded')
    await vi.advanceTimersByTimeAsync(140)

    expect(useRouteLoading().isNavigating.value).toBe(false)
    gate.resolve()
  })

  it('clears when a navigation is aborted', async () => {
    const router = makeRouter()
    const gate = deferred()
    // A guard that rejects the navigation: the outlet never changes, so only `afterEach`
    // can take the overlay down again.
    router.beforeEach(() => gate.promise.then(() => false))

    const navigation = router.push('/guarded')
    await vi.advanceTimersByTimeAsync(200)
    expect(useRouteLoading().isNavigating.value).toBe(true)

    gate.resolve()
    await navigation
    expect(useRouteLoading().isNavigating.value).toBe(false)
  })

  it('clears when a navigation redirects', async () => {
    const router = makeRouter()
    const gate = deferred()
    router.beforeEach((to) => (to.path === '/guarded' ? gate.promise.then(() => '/next') : true))

    const navigation = router.push('/guarded')
    await vi.advanceTimersByTimeAsync(200)
    expect(useRouteLoading().isNavigating.value).toBe(true)

    gate.resolve()
    await navigation
    await vi.advanceTimersByTimeAsync(200)

    // The redirect is a second navigation; the overlay must not be left up by the first.
    expect(useRouteLoading().isNavigating.value).toBe(false)
  })

  it('clears when a route component fails to load', async () => {
    /*
     * The real case is a stale chunk hash after a deploy. Without `onError` the overlay would
     * sit over a page that is never going to change — the one outcome worse than no overlay.
     */
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: Blank },
        { path: '/broken', component: () => Promise.reject(new Error('chunk load failed')) },
      ],
    })
    trackRouteLoading(router)
    await router.push('/')

    await router.push('/broken').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(500)

    expect(useRouteLoading().isNavigating.value).toBe(false)
  })
})
