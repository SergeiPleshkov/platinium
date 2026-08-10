import { beforeEach, describe, expect, it } from 'vitest'

import type { AuthSession, User } from '@/features/auth/types'
import { SEED_PASSWORD } from '@/mocks/fixtures'
import type { ApiErrorBody } from '@/shared/types/api'
import { get, post, signIn } from '@tests/utils/apiClient'

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
