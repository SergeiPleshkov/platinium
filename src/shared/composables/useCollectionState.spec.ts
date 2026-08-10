import { describe, expect, it } from 'vitest'

import { isPendingRow, useCollectionState } from '@/shared/composables/useCollectionState'
import type { ListResponse } from '@/shared/types/api'

/**
 * The shared collection state, with attention to the virtual buffer.
 *
 * The buffer's whole job is to be *sparse but correctly sized* — a scrollbar that reports 250
 * rows before 240 of them have been fetched. The tests below pin the two ways that goes
 * wrong: rows landing at the wrong offset, and a stale buffer surviving a change that shifted
 * every row after it.
 */

interface Row {
  id: string
  name: string
}

function page(pageNumber: number, total = 25, perPage = 10): ListResponse<Row> {
  const offset = (pageNumber - 1) * perPage
  const size = Math.max(0, Math.min(perPage, total - offset))

  return {
    data: Array.from({ length: size }, (_unused, index) => ({
      id: `row_${offset + index}`,
      name: `Row ${offset + index}`,
    })),
    meta: { total, page: pageNumber, perPage, totalPages: Math.ceil(total / perPage) },
  }
}

describe('useCollectionState — virtual buffer', () => {
  it('sizes itself to the total on the first window, not to the rows received', () => {
    const state = useCollectionState<Row>()

    state.setWindow(page(1))

    // Ten rows arrived; the scrollbar must already know there are 25.
    expect(state.buffer.value).toHaveLength(25)
  })

  it('places a page at its own offset, leaving the rest pending', () => {
    const state = useCollectionState<Row>()

    state.setWindow(page(3))

    expect(state.buffer.value[20]).toMatchObject({ id: 'row_20' })
    expect(isPendingRow(state.buffer.value[19]!)).toBe(true)
    expect(isPendingRow(state.buffer.value[0]!)).toBe(true)
  })

  it('accumulates pages rather than replacing them', () => {
    const state = useCollectionState<Row>()

    state.setWindow(page(1))
    state.setWindow(page(3))

    // The distinction from `setResult`, which exists to replace.
    expect(state.buffer.value[0]).toMatchObject({ id: 'row_0' })
    expect(state.buffer.value[20]).toMatchObject({ id: 'row_20' })
  })

  it('gives every pending slot a distinct id, so rows can be keyed', () => {
    const state = useCollectionState<Row>()

    state.setWindow(page(1))
    const ids = new Set(state.buffer.value.map((row) => row.id))

    expect(ids.size).toBe(25)
  })

  it('re-seeds when the total changes, discarding pages that may have shifted', () => {
    const state = useCollectionState<Row>()

    state.setWindow(page(1, 25))
    state.setWindow({ ...page(1, 40), meta: { total: 40, page: 1, perPage: 10, totalPages: 4 } })

    expect(state.buffer.value).toHaveLength(40)
  })

  it('patches an edited row in place', () => {
    const state = useCollectionState<Row>()
    state.setWindow(page(1))

    state.upsert({ id: 'row_3', name: 'Renamed' })

    expect(state.buffer.value[3]).toMatchObject({ name: 'Renamed' })
  })

  it('invalidates the buffer on a delete, because every later row moved', () => {
    const state = useCollectionState<Row>()
    state.setResult(page(1))
    state.setWindow(page(1))

    state.removeById('row_3')

    // Patching would leave rows 4+ one position out of step with the server.
    expect(state.buffer.value).toEqual([])
  })

  it('is emptied by resetBuffer without disturbing the paginated rows', () => {
    const state = useCollectionState<Row>()
    state.setResult(page(1))
    state.setWindow(page(1))

    state.resetBuffer()

    expect(state.buffer.value).toEqual([])
    expect(state.items.value).toHaveLength(10)
  })

  it('is cleared by a full reset', () => {
    const state = useCollectionState<Row>()
    state.setWindow(page(1))

    state.reset()

    expect(state.buffer.value).toEqual([])
    expect(state.status.value).toBe('idle')
  })
})
