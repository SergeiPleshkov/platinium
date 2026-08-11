import { http, HttpResponse, type RequestHandler } from 'msw'
import { z } from 'zod'

import { loginSchema } from '@/features/auth/schema'
import type { AuthSession, UserPreferences } from '@/features/auth/types'
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
/**
 * A cap, because this is user-supplied and persisted. Fifty widget ids is far more than the
 * dashboard will ever have; the limit exists so a malformed client cannot grow the record
 * without bound.
 */
const preferencesSchema = z.object({
  dashboardOrder: z.array(z.string().max(64)).max(50).optional(),
})

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

  /**
   * Saves preferences against the account.
   *
   * A `PATCH` that merges rather than replaces: a future preference added in another part of
   * the app must not be wiped by the dashboard saving its arrangement. The stored user object
   * *is* the record, so the next `/auth/me` returns it without any further plumbing.
   */
  http.patch(`${API_BASE}/me/preferences`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure

    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return errorResponse(400, 'The request body was not valid JSON.')
    }

    const parsed = preferencesSchema.safeParse(raw)
    if (!parsed.success) {
      return errorResponse(422, 'Those preferences are not valid.')
    }

    /*
     * Only keys the request actually carried. A plain spread would let an omitted key arrive
     * as `undefined` and erase a stored preference, which is a `PUT`'s behaviour, not a
     * `PATCH`'s, and would make one screen's save quietly reset another's setting.
     */
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    )
    auth.user.preferences = { ...auth.user.preferences, ...changes }

    return HttpResponse.json<UserPreferences>(auth.user.preferences)
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
