import { beforeEach, describe, expect, it } from 'vitest'

import { resetNotifications, useNotifications } from '@/shared/composables/useNotifications'
import { ApiError } from '@/shared/api'

/**
 * Notification policy, tested without a UI.
 *
 * `fromError` is the single point that decides whether a failure reaches the user at all, and
 * two of its three branches decide to stay silent. Silence is the hard thing to test by hand
 * and the easy thing to break: nothing on screen looks wrong when a toast that should have
 * appeared does not, or when one that should have been suppressed floods the corner.
 */

let notifications: ReturnType<typeof useNotifications>

beforeEach(() => {
  resetNotifications()
  notifications = useNotifications()
})

describe('fromError', () => {
  it('raises the error with the message the server sent', () => {
    const id = notifications.fromError(
      new ApiError({ kind: 'http', status: 409, message: 'Still has 25 tickets.' }),
    )

    expect(id).not.toBeNull()
    expect(notifications.notifications.value).toHaveLength(1)
    expect(notifications.notifications.value[0]).toMatchObject({
      severity: 'error',
      summary: 'Still has 25 tickets.',
    })
  })

  it('falls back to the caller message when the thrown value is not an ApiError', () => {
    notifications.fromError(new TypeError('undefined is not a function'), 'Could not export.')

    // The internal message is for a log, never for a person reading a toast.
    expect(notifications.notifications.value[0]?.summary).toBe('Could not export.')
  })

  it('stays silent for a request we superseded', () => {
    // Every keystroke in a debounced search aborts the last one. Announcing that would
    // produce a toast per character.
    const id = notifications.fromError(
      new ApiError({ kind: 'aborted', status: 0, message: 'The request was cancelled.' }),
    )

    expect(id).toBeNull()
    expect(notifications.notifications.value).toHaveLength(0)
  })

  it('stays silent for a 422, which is already rendered on the fields', () => {
    const id = notifications.fromError(
      new ApiError({
        kind: 'http',
        status: 422,
        message: 'Some of the details are not valid.',
        fieldErrors: { name: 'Enter a name' },
      }),
    )

    expect(id).toBeNull()
    expect(notifications.notifications.value).toHaveLength(0)
  })

  it('still speaks for a 422 that carries no field errors', () => {
    // Nothing placed it on a field, so suppressing it would lose the failure entirely.
    const id = notifications.fromError(
      new ApiError({ kind: 'http', status: 422, message: 'The upload was rejected.' }),
    )

    expect(id).not.toBeNull()
    expect(notifications.notifications.value[0]?.summary).toBe('The upload was rejected.')
  })
})

describe('the queue', () => {
  it('keeps errors until they are dismissed, and lets the rest expire', () => {
    notifications.success('Saved')
    notifications.error('Failed')

    const [success, failure] = notifications.notifications.value
    expect(success?.life).toBeGreaterThan(0)
    expect(failure?.life).toBeNull()
  })

  it('dismisses one entry by id and leaves the others', () => {
    const first = notifications.success('Saved')
    notifications.warn('Careful')

    notifications.dismiss(first)

    expect(notifications.notifications.value).toHaveLength(1)
    expect(notifications.notifications.value[0]?.summary).toBe('Careful')
  })

  it('clears everything', () => {
    notifications.info('One')
    notifications.info('Two')

    notifications.clear()

    expect(notifications.notifications.value).toHaveLength(0)
  })
})
