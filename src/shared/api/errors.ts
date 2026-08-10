import type { ApiErrorBody } from '@/shared/types/api'

/**
 * The one error type the rest of the application sees.
 *
 * Network failure, timeout, 4xx and 5xx all arrive at callers in this shape, so a store never
 * has to ask "is this a `TypeError` from fetch, a non-ok `Response`, or a thrown string?" —
 * a question that, unanswered, is how apps end up rendering "[object Object]".
 */

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'parse'

export interface ApiErrorOptions {
  kind: ApiErrorKind
  status: number
  message: string
  fieldErrors?: Record<string, string>
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number
  /** Field name → message, populated from a 422. Empty for every other failure. */
  readonly fieldErrors: Record<string, string>

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status
    this.fieldErrors = options.fieldErrors ?? {}
  }

  /** A 422 whose field errors can be projected back onto the form that caused them. */
  get isValidation(): boolean {
    return this.status === 422 && Object.keys(this.fieldErrors).length > 0
  }

  /** The session is gone — the caller should sign out rather than retry. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** The server refused because of state, e.g. deleting an event that still has tickets. */
  get isConflict(): boolean {
    return this.status === 409
  }

  /** Retrying might work: a timeout, a dropped connection, or a server-side fault. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.status >= 500
  }

  /** The caller superseded this request; it should be ignored, not surfaced. */
  get isAborted(): boolean {
    return this.kind === 'aborted'
  }
}

/** True when a thrown value is an abort we deliberately caused. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiError) return error.isAborted
  return error instanceof DOMException && error.name === 'AbortError'
}

const GENERIC_MESSAGES: Record<number, string> = {
  400: 'The request could not be understood.',
  401: 'Your session has expired. Sign in again to continue.',
  403: 'You do not have permission to do that.',
  404: 'That record no longer exists. It may have been deleted.',
  409: 'Someone else changed this record. Reload and try again.',
  422: 'Some of the details are not valid. Check the highlighted fields.',
  429: 'Too many requests. Wait a moment and try again.',
}

/**
 * Turns a failed response into an `ApiError`.
 *
 * The server's own message wins when it sent one, because it knows things the client does not
 * — which event blocked a delete, which field collided. The generic table is the fallback,
 * and it never leaks a status code or a stack trace to a user.
 */
export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  const parsed = isErrorBody(body) ? body : null
  const message =
    parsed?.message ??
    GENERIC_MESSAGES[status] ??
    (status >= 500
      ? 'Something went wrong on our end. Try again in a moment.'
      : 'The request failed. Try again.')

  return new ApiError({
    kind: 'http',
    status,
    message,
    ...(parsed?.errors ? { fieldErrors: parsed.errors } : {}),
  })
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null) return false
  const candidate = body as Record<string, unknown>
  return typeof candidate['message'] === 'string'
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({
    kind: 'network',
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
    cause,
  })
}

export function timeoutError(timeoutMs: number): ApiError {
  return new ApiError({
    kind: 'timeout',
    status: 0,
    message: `The request took longer than ${Math.round(timeoutMs / 1000)}s. Try again.`,
  })
}

export function abortError(): ApiError {
  return new ApiError({ kind: 'aborted', status: 0, message: 'The request was cancelled.' })
}
