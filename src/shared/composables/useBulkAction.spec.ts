import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api'
import { useBulkAction } from '@/shared/composables/useBulkAction'
import { resetNotifications, useNotifications } from '@/shared/composables/useNotifications'
import type { BulkRequest, BulkResult } from '@/shared/types/bulk'

function createHarness() {
  const run = vi.fn((_payload: BulkRequest): Promise<BulkResult> =>
    Promise.resolve({
      succeeded: [],
      failed: [],
    }),
  )
  const refresh = vi.fn((): Promise<void> => Promise.resolve())
  const clearSelection = vi.fn()

  const bulk = useBulkAction({
    run,
    refresh,
    clearSelection,
    labelFor: (id: string) => `Item ${id}`,
    entityLabel: 'tickets',
  })

  return { bulk, run, refresh, clearSelection }
}

beforeEach(() => {
  resetNotifications()
})

describe('useBulkAction', () => {
  it('clears selection and shows success toast when all succeed', async () => {
    const { bulk, run, clearSelection } = createHarness()
    run.mockResolvedValue({ succeeded: ['a', 'b'], failed: [] })

    await bulk.execute({ action: 'delete', ids: ['a', 'b'] }, 'deleted')

    expect(clearSelection).toHaveBeenCalled()
    expect(bulk.failures.value).toEqual([])

    const notifications = useNotifications()
    expect(notifications.notifications.value.some((n) => n.severity === 'success')).toBe(true)
  })

  it('keeps selection and populates failures on total failure', async () => {
    const { bulk, run, clearSelection } = createHarness()
    run.mockResolvedValue({
      succeeded: [],
      failed: [
        { id: 'a', reason: 'Has tickets' },
        { id: 'b', reason: 'Has tickets' },
      ],
    })

    await bulk.execute({ action: 'delete', ids: ['a', 'b'] }, 'deleted')

    expect(clearSelection).not.toHaveBeenCalled()
    expect(bulk.failures.value).toHaveLength(2)
    expect(bulk.hasFailures.value).toBe(true)

    const notifications = useNotifications()
    expect(notifications.notifications.value.some((n) => n.severity === 'error')).toBe(true)
  })

  it('clears selection and populates failures on partial failure', async () => {
    const { bulk, run, clearSelection } = createHarness()
    run.mockResolvedValue({
      succeeded: ['a'],
      failed: [{ id: 'b', reason: 'Has tickets' }],
    })

    await bulk.execute({ action: 'delete', ids: ['a', 'b'] }, 'deleted')

    expect(clearSelection).toHaveBeenCalled()
    expect(bulk.failures.value).toHaveLength(1)
    expect(bulk.failures.value[0]!.label).toBe('Item b')

    const notifications = useNotifications()
    expect(notifications.notifications.value.some((n) => n.severity === 'warn')).toBe(true)
  })

  it('uses fromError on transport throw and clears busy', async () => {
    const { bulk, run } = createHarness()
    run.mockRejectedValue(new ApiError({ kind: 'network', status: 0, message: 'Network failure' }))

    await bulk.execute({ action: 'delete', ids: ['a'] }, 'deleted')

    expect(bulk.busy.value).toBe(false)

    const notifications = useNotifications()
    expect(notifications.notifications.value.some((n) => n.severity === 'error')).toBe(true)
  })

  it('dismissFailures clears the failure list', async () => {
    const { bulk, run } = createHarness()
    run.mockResolvedValue({
      succeeded: ['a'],
      failed: [{ id: 'b', reason: 'Conflict' }],
    })

    await bulk.execute({ action: 'delete', ids: ['a', 'b'] }, 'deleted')
    expect(bulk.hasFailures.value).toBe(true)

    bulk.dismissFailures()
    expect(bulk.hasFailures.value).toBe(false)
  })
})
