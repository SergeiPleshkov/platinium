import { HttpResponse } from 'msw'
import type { z } from 'zod'

import type { User } from '@/features/auth/types'
import { db } from '@/mocks/db'
import { delay, forcedFailureStatus } from '@/mocks/config'
import type { ApiErrorBody } from '@/shared/types/api'

/** Shared plumbing for every handler: latency, failure injection, auth, validation. */

/*
 * These return the plain `Response` type rather than `HttpResponse<ApiErrorBody>` on purpose.
 * MSW infers a resolver's body type from what it returns, so a narrowly-typed error helper
 * would pin every handler to `ApiErrorBody` and reject its actual success payload.
 */
export function errorResponse(
  status: number,
  message: string,
  errors?: Record<string, string>,
): Response {
  return HttpResponse.json<ApiErrorBody>(errors ? { message, errors } : { message }, { status })
}

export function notFound(resource: string): Response {
  return errorResponse(404, `That ${resource} no longer exists. It may have been deleted.`)
}

const FORCED_FAILURE_MESSAGES: Record<number, string> = {
  400: 'The request could not be understood.',
  401: 'Your session has expired. Sign in again to continue.',
  403: 'You do not have permission to do that.',
  404: 'That record no longer exists.',
  409: 'Someone else changed this record. Reload and try again.',
  422: 'Some of the details are not valid.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'Something went wrong on our end. Try again in a moment.',
  503: 'The service is temporarily unavailable. Try again shortly.',
}

/**
 * Runs before every handler: applies the artificial delay, then short-circuits with an error
 * if this request was told to fail. Returns `null` when the handler should proceed.
 */
export async function preflight(request: Request): Promise<Response | null> {
  await delay()

  const status = forcedFailureStatus(request)
  if (status === null) return null

  return errorResponse(
    status,
    FORCED_FAILURE_MESSAGES[status] ?? 'The request failed. Try again in a moment.',
  )
}

export type AuthResult = { ok: true; user: User } | { ok: false; response: Response }

/**
 * Bearer-token auth against the session table.
 *
 * Mocked, but genuinely enforced: every entity endpoint calls this, so an unauthenticated
 * request gets a real 401 and the client's session-expiry path is exercisable rather than
 * theoretical.
 */
export function requireAuth(request: Request): AuthResult {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const userId = token ? db.sessions.get(token) : undefined
  const user = userId ? db.users.find((candidate) => candidate.id === userId) : undefined

  if (!user) {
    return {
      ok: false,
      response: errorResponse(401, 'Your session has expired. Sign in again to continue.'),
    }
  }

  return { ok: true, user }
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response }

/**
 * Validates a request body against the same zod schema the form uses, and projects failures
 * into the `{ message, errors }` shape the client maps back onto individual fields.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: errorResponse(400, 'The request body was not valid JSON.') }
  }

  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  /*
   * Walk the issues directly rather than flattening: this keeps the dotted path for nested
   * fields, and keeps the *first* message per field, which is the one worth showing.
   */
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join('.')
    if (field !== '' && !(field in errors)) errors[field] = issue.message
  }

  return {
    ok: false,
    response: errorResponse(422, 'Some of the details are not valid.', errors),
  }
}

/** Applies `updatedAt` on mutation, so the client never has to guess. */
export function touch<T extends { updatedAt: string }>(entity: T, timestamp: string): T {
  entity.updatedAt = timestamp
  return entity
}
