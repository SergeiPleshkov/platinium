import { HttpResponse } from 'msw'

import type { User } from '@/features/auth/types'
import { errorResponse, requirePermission } from '@/mocks/support'
import {
  BULK_LIMIT,
  type BulkAction,
  type BulkFailure,
  type BulkRequest,
  type BulkResult,
} from '@/shared/types/bulk'

/**
 * The bulk endpoint, written once for every entity that has one.
 *
 * Unlike the CRUD handlers, spelled out per entity because their differences are the point
 * this is the same algorithm every time; only "what does deleting one of these mean" varies,
 * and that arrives as a callback.
 *
 * Each id is attempted independently. A transaction would be defensible for a real database,
 * but it turns "three of these have tickets" into "nothing happened", leaving the admin to
 * find the three by hand.
 */

export interface BulkHandlers {
  /** Attempts one delete. Return a reason to refuse it; return `null` on success. */
  deleteOne?: (id: string) => string | null
  /** Attempts one status change. Same contract. */
  setStatus?: (id: string, status: string) => string | null
  /** Rejects a status value this entity does not have, before anything is attempted. */
  isValidStatus?: (status: string) => boolean
  /** Runs once after any successful change, for denormalised counts. */
  afterChange?: () => void
}

/**
 * Which permission an action needs.
 *
 * A bulk delete is a delete: it must not become a back door for a role that cannot delete one
 * record at a time. This mapping is why an editor gets a 403 from `action: 'delete'` here
 * exactly as they do from `DELETE /api/tickets/:id`.
 */
const ACTION_PERMISSION = { delete: 'delete', status: 'update' } as const

function parseRequest(raw: unknown): BulkRequest | null {
  if (typeof raw !== 'object' || raw === null) return null

  const candidate = raw as Partial<BulkRequest>
  if (candidate.action !== 'delete' && candidate.action !== 'status') return null
  if (!Array.isArray(candidate.ids)) return null
  if (!candidate.ids.every((id): id is string => typeof id === 'string')) return null

  return {
    action: candidate.action,
    ids: candidate.ids,
    ...(typeof candidate.status === 'string' ? { status: candidate.status } : {}),
  }
}

export async function handleBulk(
  request: Request,
  user: User,
  handlers: BulkHandlers,
): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse(400, 'The request body was not valid JSON.')
  }

  const parsed = parseRequest(raw)
  if (!parsed) {
    return errorResponse(400, 'A bulk request needs an action and a list of ids.')
  }

  const forbidden = requirePermission(user, ACTION_PERMISSION[parsed.action])
  if (forbidden) return forbidden

  if (parsed.ids.length === 0) {
    return errorResponse(422, 'Select at least one record.')
  }
  if (parsed.ids.length > BULK_LIMIT) {
    return errorResponse(422, `Select at most ${BULK_LIMIT} records at a time.`)
  }

  const attempt = pickAttempt(parsed, handlers)
  if (typeof attempt === 'string') return errorResponse(422, attempt)

  const succeeded: string[] = []
  const failed: BulkFailure[] = []

  /*
   * Duplicates are collapsed rather than attempted twice. The second attempt on an id that
   * was just deleted would report "no longer exists", which is true and useless. The client
   * asked once, conceptually.
   */
  for (const id of new Set(parsed.ids)) {
    const reason = attempt(id)
    if (reason === null) succeeded.push(id)
    else failed.push({ id, reason })
  }

  if (succeeded.length > 0) handlers.afterChange?.()

  const result: BulkResult = { succeeded, failed }

  /*
   * 207 when some records were refused, 200 when none were.
   *
   * Both are 2xx, because the operation *ran*. The client must read the body either way, and
   * a 4xx would push the whole thing down an error path that cannot report seven successes.
   * The distinct code is for anything watching the wire: logs, a proxy, a future retry policy.
   */
  return HttpResponse.json(result, { status: failed.length > 0 ? 207 : 200 })
}

/** Resolves the per-id operation, or returns the message explaining why it cannot. */
function pickAttempt(
  parsed: BulkRequest,
  handlers: BulkHandlers,
): ((id: string) => string | null) | string {
  if (parsed.action === 'delete') {
    const { deleteOne } = handlers
    if (!deleteOne) return 'These records cannot be deleted in bulk.'
    return deleteOne
  }

  const { setStatus, isValidStatus } = handlers
  if (!setStatus) return 'These records do not have a status.'

  const status = parsed.status
  if (status === undefined) return 'Choose a status to apply.'
  if (isValidStatus && !isValidStatus(status)) return `“${status}” is not a valid status.`

  return (id) => setStatus(id, status)
}

export type { BulkAction }
