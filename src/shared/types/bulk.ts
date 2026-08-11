/**
 * The contract for operations over many records at once.
 *
 * The shape exists because of one decision: a bulk operation **reports per record**. Ten
 * deletes where three are blocked by referential integrity is not a success and not a
 * failure. It is seven successes and three explained refusals, and collapsing that into a
 * single status code throws away the only information the admin needs.
 *
 * Anything that returns a bare `{ ok: true }` here has silently decided the user does not
 * need to know which three.
 */

export type BulkAction = 'delete' | 'status'

export interface BulkRequest {
  action: BulkAction
  ids: string[]
  /** Required when `action` is `status`; ignored otherwise. */
  status?: string
}

export interface BulkFailure {
  id: string
  /** Shown verbatim beside the record's name, so it must be a sentence, not a code. */
  reason: string
}

export interface BulkResult {
  /** Ids that were changed. */
  succeeded: string[]
  /** Ids that were not, each with the reason. */
  failed: BulkFailure[]
}

/** Caps a single request. Beyond this the client should be paging, not batching harder. */
export const BULK_LIMIT = 200

export function isPartialFailure(result: BulkResult): boolean {
  return result.failed.length > 0 && result.succeeded.length > 0
}

export function isTotalFailure(result: BulkResult): boolean {
  return result.failed.length > 0 && result.succeeded.length === 0
}
