import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { useAuthStore } from '@/features/auth'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * The navigation overlay, rendered rather than merely computed.
 *
 * `useRouteLoading.spec.ts` covers the timing rules against a bare router. What this adds is
 * that `App.vue` actually shows something, and that it sits *above* the router outlet, so it
 * survives the view swap it exists to cover. Mounted inside a routed view it would unmount at
 * the exact moment the incoming chunk resolved.
 */

/** Holds a navigation open until released, standing in for a chunk still downloading. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
})

describe('lazy route navigation', () => {
  it('shows no overlay when the view is already available', async () => {
    await renderWithApp(App, { initialRoute: '/login' })

    expect(screen.queryByText('Loading page')).not.toBeInTheDocument()
  })

  it('covers the page while a slow navigation is in flight', async () => {
    const { router, pinia } = await renderWithApp(App, { initialRoute: '/login' })
    await useAuthStore(pinia).login({ email: 'admin@ticketing.test', password: 'password123' })

    const gate = deferred()
    router.beforeEach(() => gate.promise.then(() => true))

    const navigation = router.push('/events')

    // Real timers here: the assertion is that the overlay reaches the DOM, and `waitFor`
    // already tolerates the 150ms threshold.
    const overlay = await waitFor(() => screen.getByText('Loading page'))
    expect(overlay).toBeInTheDocument()

    gate.resolve()
    await navigation
  })

  it('announces itself rather than freezing silently', async () => {
    const { router, pinia } = await renderWithApp(App, { initialRoute: '/login' })
    await useAuthStore(pinia).login({ email: 'admin@ticketing.test', password: 'password123' })

    const gate = deferred()
    router.beforeEach(() => gate.promise.then(() => true))
    const navigation = router.push('/events')

    await waitFor(() => screen.getByText('Loading page'))
    /*
     * The overlay is a bare spinner, so this hidden label is the *only* thing a screen
     * reader gets, without it the page would simply appear to stop. One live region, not
     * two nested ones announcing the same wait twice.
     */
    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(1)
    expect(regions[0]).toHaveTextContent('Loading page')

    gate.resolve()
    await navigation
  })

  it('takes the overlay down once the view arrives', async () => {
    const { router, pinia } = await renderWithApp(App, { initialRoute: '/login' })
    await useAuthStore(pinia).login({ email: 'admin@ticketing.test', password: 'password123' })

    const gate = deferred()
    const stop = router.beforeEach(() => gate.promise.then(() => true))
    const navigation = router.push('/events')

    await waitFor(() => screen.getByText('Loading page'))
    gate.resolve()
    await navigation
    stop()

    await waitFor(() => expect(screen.queryByText('Loading page')).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument()
  })
})
