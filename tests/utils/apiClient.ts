import { SEED_PASSWORD } from '@/mocks/fixtures'
import type { ListResponse } from '@/shared/types/api'

/**
 * A deliberately dumb HTTP client for the mock-API tests.
 *
 * It does not use `@/shared/api` on purpose: these tests are about what the *backend* does,
 * so putting the application's client in the middle would blur which side a failure came
 * from. Store-level tests in phases 5-7 exercise the real client.
 */

/*
 * Handlers are registered with relative paths (`/api/...`), which MSW resolves against the
 * document origin. Requests must therefore target that same origin, undici's `fetch` will
 * not accept a relative URL, so it has to be spelled out.
 */
const ORIGIN = typeof window === 'undefined' ? 'http://localhost' : window.location.origin

export interface ApiCall<T> {
  status: number
  body: T
}

export async function call<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<ApiCall<T>> {
  const { token, headers, ...rest } = init

  const response = await fetch(`${ORIGIN}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  const text = await response.text()
  const body = text === '' ? (undefined as T) : (JSON.parse(text) as T)

  return { status: response.status, body }
}

export function get<T>(path: string, token?: string): Promise<ApiCall<T>> {
  return call<T>(path, token === undefined ? {} : { token })
}

export function post<T>(path: string, payload: unknown, token?: string): Promise<ApiCall<T>> {
  return call<T>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
    ...(token === undefined ? {} : { token }),
  })
}

export function patch<T>(path: string, payload: unknown, token?: string): Promise<ApiCall<T>> {
  return call<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    ...(token === undefined ? {} : { token }),
  })
}

export function del<T>(path: string, token?: string): Promise<ApiCall<T>> {
  return call<T>(path, { method: 'DELETE', ...(token === undefined ? {} : { token }) })
}

/** Signs in as the seeded administrator and returns the bearer token. */
export async function signIn(email = 'admin@ticketing.test'): Promise<string> {
  const result = await post<{ token: string }>('/api/auth/login', {
    email,
    password: SEED_PASSWORD,
  })

  if (result.status !== 200) {
    throw new Error(`Test sign-in failed with status ${result.status}`)
  }

  return result.body.token
}

export type ListOf<T> = ListResponse<T>
