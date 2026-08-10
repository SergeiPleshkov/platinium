import { http as mswHttp, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import { ApiError, isAbortError } from '@/shared/api/errors'
import { buildQueryString, configureHttp, http, resetHttpConfig } from '@/shared/api/http'

/**
 * The client is tested against MSW rather than a stubbed `fetch`, so these assertions cover
 * the real request/response path — headers actually sent, statuses actually parsed.
 */

const ORIGIN = 'http://localhost'

beforeEach(() => {
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => 'test-token' })
})

afterEach(() => {
  resetHttpConfig()
})

describe('buildQueryString', () => {
  it('omits empty, null and undefined values', () => {
    const result = buildQueryString({ a: 1, b: '', c: null, d: undefined, e: 'x' })
    expect(result).toBe('?a=1&e=x')
  })

  it('repeats a param for each array item, which is how multi-select filters travel', () => {
    expect(buildQueryString({ status: ['draft', 'paused'] })).toBe('?status=draft&status=paused')
  })

  it('returns an empty string when nothing survives', () => {
    expect(buildQueryString({ a: undefined, b: '' })).toBe('')
  })

  it('encodes values that would otherwise break the URL', () => {
    expect(buildQueryString({ search: 'rock & roll' })).toBe('?search=rock+%26+roll')
  })
})

describe('http client', () => {
  it('sends the bearer token supplied by the configured provider', async () => {
    let seen: string | null = null
    server.use(
      mswHttp.get(`${ORIGIN}/api/probe`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ ok: true })
      }),
    )

    await http.get('/probe')

    expect(seen).toBe('Bearer test-token')
  })

  it('omits the authorization header when there is no token', async () => {
    configureHttp({ getAuthToken: () => null })
    let seen: string | null = 'unset'
    server.use(
      mswHttp.get(`${ORIGIN}/api/probe`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ ok: true })
      }),
    )

    await http.get('/probe')

    expect(seen).toBeNull()
  })

  it('returns undefined for a 204 rather than failing to parse an empty body', async () => {
    server.use(mswHttp.delete(`${ORIGIN}/api/probe`, () => new HttpResponse(null, { status: 204 })))

    await expect(http.delete('/probe')).resolves.toBeUndefined()
  })

  it('serialises a JSON body and sets the content type', async () => {
    let contentType: string | null = null
    let received: unknown = null
    server.use(
      mswHttp.post(`${ORIGIN}/api/probe`, async ({ request }) => {
        contentType = request.headers.get('content-type')
        received = await request.json()
        return HttpResponse.json({ ok: true }, { status: 201 })
      }),
    )

    await http.post('/probe', { name: 'Test' })

    expect(contentType).toBe('application/json')
    expect(received).toEqual({ name: 'Test' })
  })

  describe('error normalisation', () => {
    it('turns a 422 into a validation ApiError carrying field errors', async () => {
      server.use(
        mswHttp.post(`${ORIGIN}/api/probe`, () =>
          HttpResponse.json(
            { message: 'Some of the details are not valid.', errors: { name: 'Enter a name' } },
            { status: 422 },
          ),
        ),
      )

      const error = await http.post('/probe', {}).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ApiError)
      const apiError = error as ApiError
      expect(apiError.isValidation).toBe(true)
      expect(apiError.fieldErrors).toEqual({ name: 'Enter a name' })
      expect(apiError.status).toBe(422)
    })

    it("prefers the server's message, which knows things the client does not", async () => {
      server.use(
        mswHttp.delete(`${ORIGIN}/api/probe`, () =>
          HttpResponse.json({ message: '“Summer Gala” still has 12 tickets.' }, { status: 409 }),
        ),
      )

      const error = (await http.delete('/probe').catch((caught: unknown) => caught)) as ApiError

      expect(error.isConflict).toBe(true)
      expect(error.message).toBe('“Summer Gala” still has 12 tickets.')
    })

    it('falls back to a human message when the server sends none', async () => {
      server.use(mswHttp.get(`${ORIGIN}/api/probe`, () => new HttpResponse(null, { status: 500 })))

      const error = (await http.get('/probe').catch((caught: unknown) => caught)) as ApiError

      expect(error.message).toMatch(/went wrong on our end/i)
      expect(error.message).not.toMatch(/500/)
      expect(error.isRetryable).toBe(true)
    })

    it('normalises a dropped connection into a network ApiError', async () => {
      server.use(mswHttp.get(`${ORIGIN}/api/probe`, () => HttpResponse.error()))

      const error = (await http.get('/probe').catch((caught: unknown) => caught)) as ApiError

      expect(error).toBeInstanceOf(ApiError)
      expect(error.kind).toBe('network')
      expect(error.status).toBe(0)
      expect(error.isRetryable).toBe(true)
      expect(error.message).toMatch(/could not reach the server/i)
    })

    it('reports a timeout distinctly from a cancellation', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/probe`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return HttpResponse.json({ ok: true })
        }),
      )

      const error = (await http
        .get('/probe', { timeoutMs: 5 })
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.kind).toBe('timeout')
      expect(error.isRetryable).toBe(true)
      expect(isAbortError(error)).toBe(false)
    })

    it('marks a caller-cancelled request as aborted so it can be ignored', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/probe`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return HttpResponse.json({ ok: true })
        }),
      )

      const controller = new AbortController()
      const pending = http.get('/probe', { signal: controller.signal })
      controller.abort()

      const error = (await pending.catch((caught: unknown) => caught)) as ApiError

      expect(error.kind).toBe('aborted')
      expect(isAbortError(error)).toBe(true)
      // An aborted request is not a failure the user should ever see.
      expect(error.isRetryable).toBe(false)
    })
  })

  describe('401 handling', () => {
    it('calls onUnauthorized once, centrally', async () => {
      const onUnauthorized = vi.fn()
      configureHttp({ onUnauthorized })
      server.use(
        mswHttp.get(`${ORIGIN}/api/probe`, () =>
          HttpResponse.json({ message: 'Session expired.' }, { status: 401 }),
        ),
      )

      await http.get('/probe').catch(() => undefined)

      expect(onUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('does not sign the user out when the login request itself is rejected', async () => {
      const onUnauthorized = vi.fn()
      configureHttp({ onUnauthorized })
      server.use(
        mswHttp.post(`${ORIGIN}/api/auth/login`, () =>
          HttpResponse.json({ message: 'Those credentials are not correct.' }, { status: 401 }),
        ),
      )

      const error = (await http
        .post('/auth/login', { email: 'a@b.test', password: 'nope' })
        .catch((caught: unknown) => caught)) as ApiError

      // A rejected sign-in is a form error; wiping the session here would erase the message.
      expect(onUnauthorized).not.toHaveBeenCalled()
      expect(error.message).toMatch(/not correct/i)
    })
  })
})
