import { beforeEach, describe, expect, it } from 'vitest'

import type { AuthSession, User } from '@/features/auth/types'
import { SEED_PASSWORD } from '@/mocks/fixtures'
import type { ApiErrorBody } from '@/shared/types/api'
import { get, patch, post, signIn } from '@tests/utils/apiClient'

describe('mock API — auth', () => {
  let token: string

  beforeEach(async () => {
    token = await signIn()
  })

  describe('login', () => {
    it('issues a token and returns the user', async () => {
      const result = await post<AuthSession>('/api/auth/login', {
        email: 'admin@ticketing.test',
        password: SEED_PASSWORD,
      })

      expect(result.status).toBe(200)
      expect(result.body.token).toBeTruthy()
      expect(result.body.user).toMatchObject({ email: 'admin@ticketing.test', role: 'admin' })
    })

    it('accepts the email case-insensitively', async () => {
      const result = await post<AuthSession>('/api/auth/login', {
        email: 'ADMIN@Ticketing.test',
        password: SEED_PASSWORD,
      })

      expect(result.status).toBe(200)
    })

    it('rejects a wrong password with 401', async () => {
      const result = await post<ApiErrorBody>('/api/auth/login', {
        email: 'admin@ticketing.test',
        password: 'wrong',
      })

      expect(result.status).toBe(401)
      expect(result.body.message).toMatch(/credentials are not correct/i)
    })

    it('gives an unknown account the same message as a wrong password', async () => {
      // Distinguishing them would let a caller enumerate valid accounts.
      const unknown = await post<ApiErrorBody>('/api/auth/login', {
        email: 'nobody@ticketing.test',
        password: SEED_PASSWORD,
      })
      const wrongPassword = await post<ApiErrorBody>('/api/auth/login', {
        email: 'admin@ticketing.test',
        password: 'wrong',
      })

      expect(unknown.status).toBe(401)
      expect(unknown.body.message).toBe(wrongPassword.body.message)
    })

    it('returns field-level 422s for a malformed body', async () => {
      const result = await post<ApiErrorBody>('/api/auth/login', {
        email: 'not-an-email',
        password: '',
      })

      expect(result.status).toBe(422)
      expect(result.body.errors).toEqual({
        email: 'Enter a valid email address',
        password: 'Enter your password',
      })
    })

    it('issues a distinct token per session', async () => {
      const second = await signIn('editor@ticketing.test')
      expect(second).not.toBe(token)
    })
  })

  describe('current user', () => {
    it('returns the signed-in user', async () => {
      const result = await get<User>('/api/auth/me', token)

      expect(result.status).toBe(200)
      expect(result.body.email).toBe('admin@ticketing.test')
    })

    it('rejects a request with no token', async () => {
      const result = await get<ApiErrorBody>('/api/auth/me')

      expect(result.status).toBe(401)
      expect(result.body.message).toMatch(/session has expired/i)
    })

    it('rejects a fabricated token', async () => {
      const result = await get<ApiErrorBody>('/api/auth/me', 'mock-token-9999')
      expect(result.status).toBe(401)
    })

    it('distinguishes the roles of different accounts', async () => {
      const viewerToken = await signIn('viewer@ticketing.test')
      const result = await get<User>('/api/auth/me', viewerToken)

      expect(result.body.role).toBe('viewer')
    })
  })

  describe('logout', () => {
    it('invalidates the token', async () => {
      expect((await post('/api/auth/logout', {}, token)).status).toBe(204)

      const afterLogout = await get<ApiErrorBody>('/api/auth/me', token)
      expect(afterLogout.status).toBe(401)
    })

    it('is idempotent', async () => {
      await post('/api/auth/logout', {}, token)
      const second = await post('/api/auth/logout', {}, token)

      expect(second.status).toBe(204)
    })

    it('leaves other sessions untouched', async () => {
      const otherToken = await signIn('editor@ticketing.test')
      await post('/api/auth/logout', {}, token)

      expect((await get<User>('/api/auth/me', otherToken)).status).toBe(200)
    })
  })

  describe('protected endpoints', () => {
    it.each([['/api/categories'], ['/api/events'], ['/api/tickets']])(
      'rejects unauthenticated access to %s',
      async (path) => {
        expect((await get<ApiErrorBody>(path)).status).toBe(401)
      },
    )
  })
})

/**
 * Preferences that belong to the account rather than the browser.
 *
 * The distinction is the whole point of the endpoint: a dashboard arrangement should follow
 * the person to another machine, which `localStorage` cannot do.
 */
describe('mock API — user preferences', () => {
  it('starts with none', async () => {
    const token = await signIn()
    const me = await get<{ preferences?: { dashboardOrder?: string[] } }>('/api/auth/me', token)

    expect(me.body.preferences).toBeUndefined()
  })

  it('saves an arrangement against the account', async () => {
    const token = await signIn()

    const response = await patch<{ dashboardOrder: string[] }>(
      '/api/me/preferences',
      { dashboardOrder: ['tickets', 'events'] },
      token,
    )

    expect(response.status).toBe(200)
    expect(response.body.dashboardOrder).toEqual(['tickets', 'events'])
  })

  it('returns it on the next /auth/me, which is how a reload restores it', async () => {
    const token = await signIn()
    await patch('/api/me/preferences', { dashboardOrder: ['inventory'] }, token)

    const me = await get<{ preferences: { dashboardOrder: string[] } }>('/api/auth/me', token)

    expect(me.body.preferences.dashboardOrder).toEqual(['inventory'])
  })

  it('survives signing out and back in', async () => {
    const first = await signIn()
    await patch('/api/me/preferences', { dashboardOrder: ['busiest-events'] }, first)
    await post('/api/auth/logout', {}, first)

    const second = await signIn()
    const me = await get<{ preferences: { dashboardOrder: string[] } }>('/api/auth/me', second)

    // The point of storing it server-side rather than in the browser.
    expect(me.body.preferences.dashboardOrder).toEqual(['busiest-events'])
  })

  it('merges rather than replacing, so one screen cannot reset another', async () => {
    const token = await signIn()
    await patch('/api/me/preferences', { dashboardOrder: ['events'] }, token)

    // An empty PATCH must not erase what is already stored.
    await patch('/api/me/preferences', {}, token)

    const me = await get<{ preferences: { dashboardOrder: string[] } }>('/api/auth/me', token)
    expect(me.body.preferences.dashboardOrder).toEqual(['events'])
  })

  it('keeps each account separate', async () => {
    const admin = await signIn('admin@ticketing.test')
    const editor = await signIn('editor@ticketing.test')

    await patch('/api/me/preferences', { dashboardOrder: ['tickets'] }, admin)

    const other = await get<{ preferences?: object }>('/api/auth/me', editor)
    expect(other.body.preferences).toBeUndefined()
  })

  it('is allowed for every role — a layout is not a privileged change', async () => {
    const viewer = await signIn('viewer@ticketing.test')
    const response = await patch('/api/me/preferences', { dashboardOrder: ['events'] }, viewer)

    expect(response.status).toBe(200)
  })

  it('requires a session', async () => {
    const response = await patch('/api/me/preferences', { dashboardOrder: ['events'] })
    expect(response.status).toBe(401)
  })

  it('rejects a shape it does not recognise', async () => {
    const token = await signIn()
    const response = await patch('/api/me/preferences', { dashboardOrder: [1, 2, 3] }, token)

    expect(response.status).toBe(422)
  })

  it('caps the list, because this is user-supplied and persisted', async () => {
    const token = await signIn()
    const huge = Array.from({ length: 51 }, (_unused, index) => `w${index}`)

    expect((await patch('/api/me/preferences', { dashboardOrder: huge }, token)).status).toBe(422)
  })
})
