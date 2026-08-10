import { screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { RouteName } from '@/app/router/routes'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Phase 1 smoke coverage: the whole app — router, Pinia, PrimeVue, the shared/ui layer and
 * the Tailwind/PrimeVue token bridge — boots and renders through the real plugin chain.
 */
describe('application boot', () => {
  it('renders the landing view at the root route', async () => {
    await renderWithApp(App)

    expect(await screen.findByRole('heading', { name: 'Ticket Admin Portal' })).toBeInTheDocument()
  })

  it('renders UI-kit buttons through the shared/ui adapter layer', async () => {
    await renderWithApp(App)

    expect(await screen.findByRole('button', { name: 'Primary' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Danger' })).toBeEnabled()
  })

  it('serves the not-found view for an unknown path', async () => {
    await renderWithApp(App, { initialRoute: '/no-such-page' })

    expect(
      await screen.findByRole('heading', { name: 'This page does not exist' }),
    ).toBeInTheDocument()
  })

  it('navigates back to the portal from the not-found view', async () => {
    const { router } = await renderWithApp(App, { initialRoute: '/no-such-page' })

    await screen.findByRole('heading', { name: 'This page does not exist' })
    await router.push({ name: RouteName.Startup })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ticket Admin Portal' })).toBeInTheDocument()
    })
  })
})
