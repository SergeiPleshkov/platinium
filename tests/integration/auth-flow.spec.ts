import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { http as mswHttp, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { useAuthStore } from '@/features/auth'
import { server } from '@/mocks/server'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * The complete authentication journey, driven the way an administrator would drive it and
 * running against the real mock backend, no stubbed stores, no stubbed API.
 */

const ORIGIN = window.location.origin

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

async function signIn(email = 'admin@ticketing.test', password = 'password123'): Promise<void> {
  // Instant typing: vee-validate re-renders on each key under coverage and mangles values.
  const user = userEvent.setup({ delay: null })
  const emailField = await screen.findByLabelText(/Email address/)
  await user.clear(emailField)
  await user.type(emailField, email)
  const passwordField = screen.getByLabelText(/Password/)
  await user.clear(passwordField)
  await user.type(passwordField, password)
  await user.click(screen.getByRole('button', { name: /Sign in/ }))
}

describe('authentication flow', () => {
  it('redirects an unauthenticated visitor from a protected route to the login page', async () => {
    const { router } = await renderWithApp(App, {
      initialRoute: '/dashboard',
      withGuards: true,
    })

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('login')
    })
    expect(screen.getByRole('button', { name: /Sign in/ })).toBeInTheDocument()
  })

  it('remembers where the visitor was going', async () => {
    const { router } = await renderWithApp(App, {
      initialRoute: '/dashboard',
      withGuards: true,
    })

    await waitFor(() => {
      expect(router.currentRoute.value.query['redirect']).toBe('/dashboard')
    })
  })

  it('signs in and lands on the dashboard', async () => {
    const { router } = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

    await signIn()

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('dashboard')
    })
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText(/Signed in as Ada Okonjo/)).toBeInTheDocument()
  })

  it('shows an announced error for wrong credentials and stays on the login page', async () => {
    const { router } = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

    await signIn('admin@ticketing.test', 'wrong-password')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/credentials are not correct/i)
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('validates the form before sending anything to the server', async () => {
    await renderWithApp(App, { initialRoute: '/login', withGuards: true })

    await userEvent
      .setup({ delay: null })
      .type(await screen.findByLabelText(/Email address/), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(await screen.findByText('Enter your password')).toBeInTheDocument()
  })

  it('persists the session so a reload keeps the user signed in', async () => {
    const first = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signIn()
    await waitFor(() => {
      expect(first.router.currentRoute.value.name).toBe('dashboard')
    })

    // A fresh app instance with the same storage stands in for a page reload.
    first.unmount()
    const second = await renderWithApp(App, { initialRoute: '/dashboard', withGuards: true })

    await waitFor(() => {
      expect(second.router.currentRoute.value.name).toBe('dashboard')
    })
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('discards a stored token the server no longer recognises', async () => {
    localStorage.setItem('app.auth.token', 'mock-token-does-not-exist')

    const { router } = await renderWithApp(App, { initialRoute: '/dashboard', withGuards: true })

    // A persisted token is a claim, not proof, it is validated before the portal renders.
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('login')
    })
    expect(localStorage.getItem('app.auth.token')).toBeNull()
  })

  it('signs out and returns to the login page', async () => {
    const { router } = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('login')
    })
    expect(localStorage.getItem('app.auth.token')).toBeNull()
  })

  it('keeps an authenticated user away from the login page', async () => {
    const { router } = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })

    await router.push('/login')

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('dashboard')
    })
  })

  it('ends the session when any endpoint reports the token has expired', async () => {
    const { pinia } = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })

    const auth = useAuthStore(pinia)
    expect(auth.isAuthenticated).toBe(true)

    // Any 401 from any endpoint must end the session once, centrally.
    server.use(
      mswHttp.get(`${ORIGIN}/api/events`, () =>
        HttpResponse.json({ message: 'Your session has expired.' }, { status: 401 }),
      ),
    )
    await import('@/shared/api').then(({ http }) => http.get('/events').catch(() => undefined))

    await waitFor(() => {
      expect(auth.isAuthenticated).toBe(false)
    })
    expect(localStorage.getItem('app.auth.token')).toBeNull()
  })

  it('fills the form from a demo account shortcut', async () => {
    await renderWithApp(App, { initialRoute: '/login', withGuards: true })

    await userEvent.click(await screen.findByRole('button', { name: /editor@ticketing.test/ }))

    expect(screen.getByLabelText<HTMLInputElement>(/Email address/).value).toBe(
      'editor@ticketing.test',
    )
  })
})
