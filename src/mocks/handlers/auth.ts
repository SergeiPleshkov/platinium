import { http, HttpResponse, type RequestHandler } from 'msw'

import { loginSchema } from '@/features/auth/schema'
import type { AuthSession } from '@/features/auth/types'
import { db, nextToken } from '@/mocks/db'
import { SEED_PASSWORD } from '@/mocks/fixtures'
import { errorResponse, preflight, requireAuth, parseBody } from '@/mocks/support'
import { API_BASE } from '@/mocks/handlers/base'

/**
 * Mocked authentication.
 *
 * "Fully mocked" per the brief, but not fake: a token is issued, stored server-side, checked
 * on every subsequent request and invalidated on logout. That means the client's guard,
 * 401-interception and session-restore paths are all exercised against real behaviour.
 */
export const authHandlers: RequestHandler[] = [
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure

    const parsed = await parseBody(request, loginSchema)
    if (!parsed.ok) return parsed.response

    const user = db.users.find(
      (candidate) => candidate.email.toLowerCase() === parsed.data.email.toLowerCase(),
    )

    /*
     * One message for both "no such account" and "wrong password", attached to neither field.
     * Distinguishing them would let an unauthenticated caller enumerate valid accounts.
     */
    if (!user || parsed.data.password !== SEED_PASSWORD) {
      return errorResponse(401, 'Those credentials are not correct. Check them and try again.')
    }

    const token = nextToken()
    db.sessions.set(token, user.id)

    return HttpResponse.json<AuthSession>({ token, user })
  }),

  http.get(`${API_BASE}/auth/me`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure

    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    return HttpResponse.json(auth.user)
  }),

  http.post(`${API_BASE}/auth/logout`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure

    const header = request.headers.get('authorization') ?? ''
    if (header.startsWith('Bearer ')) {
      db.sessions.delete(header.slice('Bearer '.length))
    }

    // Idempotent: logging out twice is not an error.
    return new HttpResponse(null, { status: 204 })
  }),
]
