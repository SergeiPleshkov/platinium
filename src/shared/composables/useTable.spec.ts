import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useTable, type UseTable, type UseTableOptions } from '@/shared/composables/useTable'
import type { ListQuery } from '@/shared/types/api'

/**
 * `useTable` owns query state and nothing else — the rows live in the store. These tests
 * therefore assert on *what was asked for*, not on what came back.
 */

function withScope<T>(factory: () => T): { result: T; dispose: () => void } {
  const scope = effectScope()
  const result = scope.run(factory)!
  return { result, dispose: () => scope.stop() }
}

/** Waits out the 300ms search debounce and lets the resulting promise settle. */
async function flushDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(300)
  await nextTick()
}

let scopes: Array<() => void> = []

function makeTable(
  onQuery: UseTableOptions['onQuery'],
  overrides: Partial<UseTableOptions> = {},
): UseTable {
  const { result, dispose } = withScope(() =>
    useTable({
      onQuery,
      defaultSort: 'createdAt',
      // No router here: the URL round-trip is covered by the integration suite.
      syncUrl: false,
      ...overrides,
    }),
  )
  scopes.push(dispose)
  return result
}

const noop = (): Promise<void> => Promise.resolve()

/** A typed spy, so `mock.calls[n][0]` is a `ListQuery` rather than `never`. */
function spyQuery(): ReturnType<typeof vi.fn<(q: ListQuery, s: AbortSignal) => Promise<void>>> {
  return vi.fn((_query: ListQuery, _signal: AbortSignal) => Promise.resolve())
}

beforeEach(() => {
  vi.useFakeTimers()
  scopes = []
})

afterEach(() => {
  for (const dispose of scopes) dispose()
  vi.useRealTimers()
})

describe('useTable', () => {
  it('issues the initial query with the defaults', async () => {
    const onQuery = spyQuery()
    makeTable(onQuery)
    await nextTick()

    expect(onQuery).toHaveBeenCalledTimes(1)
    expect(onQuery.mock.calls[0]?.[0]).toMatchObject({
      search: '',
      sort: 'createdAt',
      order: 'desc',
      page: 1,
    })
  })

  it('can be told not to query until asked', async () => {
    const onQuery = spyQuery()
    const table = makeTable(onQuery, { immediate: false })
    await nextTick()

    expect(onQuery).not.toHaveBeenCalled()

    await table.refresh()
    expect(onQuery).toHaveBeenCalledTimes(1)
  })

  describe('search', () => {
    it('debounces, issuing one query rather than one per keystroke', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      for (const value of ['g', 'ga', 'gal', 'gala']) {
        table.search.value = value
        await nextTick()
      }
      expect(onQuery).toHaveBeenCalledTimes(1)

      await flushDebounce()
      expect(onQuery).toHaveBeenCalledTimes(2)
      expect(onQuery.mock.calls[1]?.[0].search).toBe('gala')
    })

    it('returns to page 1, because page 4 of the old result set is meaningless', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setPage(4)
      await nextTick()
      table.search.value = 'gala'
      await flushDebounce()

      expect(onQuery.mock.calls.at(-1)?.[0].page).toBe(1)
    })
  })

  describe('sorting', () => {
    it('cycles a column ascending, descending, then back to the default', async () => {
      const table = makeTable(noop)
      await nextTick()

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'name', order: 'asc' })

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'name', order: 'desc' })

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'createdAt', order: 'desc' })
    })

    it('starts a newly chosen column ascending', async () => {
      const table = makeTable(noop)
      await nextTick()

      table.toggleSort('price')
      await nextTick()
      table.toggleSort('name')
      await nextTick()

      expect(table.query.value).toMatchObject({ sort: 'name', order: 'asc' })
    })

    it('issues exactly one query per sort change, not one per changed field', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()
      onQuery.mockClear()

      // sort, order and page all change together; that is one user action.
      table.setSort('name', 'asc')
      await nextTick()

      expect(onQuery).toHaveBeenCalledTimes(1)
    })
  })

  describe('filters', () => {
    it('applies a filter and resets to page 1 in a single query', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setPage(3)
      await nextTick()
      onQuery.mockClear()

      table.setFilter('status', 'on_sale')
      await nextTick()

      expect(onQuery).toHaveBeenCalledTimes(1)
      expect(onQuery.mock.calls[0]?.[0]).toMatchObject({
        filters: { status: 'on_sale' },
        page: 1,
      })
    })

    it('removes a filter when cleared to an empty value', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setFilter('status', 'draft')
      await nextTick()
      table.setFilter('status', undefined)
      await nextTick()

      expect(onQuery.mock.calls.at(-1)?.[0].filters).toEqual({})
    })

    it('treats an empty array as no filter rather than "match nothing"', async () => {
      const table = makeTable(noop)
      await nextTick()

      table.setFilter('status', [])
      await nextTick()

      expect(table.hasActiveFilters.value).toBe(false)
    })

    it('keeps repeated values for a multi-select filter', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setFilter('status', ['draft', 'paused'])
      await nextTick()

      expect(onQuery.mock.calls.at(-1)?.[0].filters).toEqual({ status: ['draft', 'paused'] })
    })

    it('clears filters and search together, in one query', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setFilter('status', 'draft')
      table.search.value = 'gala'
      await flushDebounce()
      expect(table.hasActiveFilters.value).toBe(true)
      onQuery.mockClear()

      table.clearFilters()
      await nextTick()

      expect(table.hasActiveFilters.value).toBe(false)
      expect(table.search.value).toBe('')
      expect(onQuery).toHaveBeenCalledTimes(1)
    })

    it('does not fire a stale debounced search after filters are cleared', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.search.value = 'gala'
      await nextTick()
      table.clearFilters()
      await nextTick()
      onQuery.mockClear()

      await flushDebounce()

      expect(onQuery).not.toHaveBeenCalled()
    })
  })

  describe('cancellation', () => {
    it('aborts the query a new one supersedes', async () => {
      const signals: AbortSignal[] = []
      const table = makeTable((_query, signal) => {
        signals.push(signal)
        return new Promise(() => {})
      })

      await nextTick()
      table.setPage(2)
      await nextTick()

      expect(signals[0]?.aborted).toBe(true)
      expect(signals[1]?.aborted).toBe(false)
    })

    it('cancels in-flight work when its scope is disposed', async () => {
      const signals: AbortSignal[] = []
      const { dispose } = withScope(() =>
        useTable({
          onQuery: (_query, signal) => {
            signals.push(signal)
            return new Promise(() => {})
          },
          defaultSort: 'createdAt',
          syncUrl: false,
        }),
      )

      await nextTick()
      dispose()

      expect(signals[0]?.aborted).toBe(true)
    })
  })

  describe('pagination', () => {
    it('refuses a page below 1', async () => {
      const table = makeTable(noop)
      await nextTick()

      table.setPage(-5)
      await nextTick()

      expect(table.query.value.page).toBe(1)
    })

    it('returns to page 1 when the page size changes, in one query', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()

      table.setPage(4)
      await nextTick()
      onQuery.mockClear()

      table.setPerPage(100)
      await nextTick()

      expect(onQuery).toHaveBeenCalledTimes(1)
      expect(onQuery.mock.calls[0]?.[0]).toMatchObject({ perPage: 100, page: 1 })
    })

    it('adopts a page the server corrected without issuing another query', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()
      onQuery.mockClear()

      // Deleting the last row on page 4 leaves the server answering for page 3.
      table.adoptPage(3)
      await nextTick()

      expect(table.page.value).toBe(3)
      expect(onQuery).not.toHaveBeenCalled()
    })

    it('ignores adopting the page it is already on', async () => {
      const onQuery = spyQuery()
      const table = makeTable(onQuery)
      await nextTick()
      onQuery.mockClear()

      table.adoptPage(1)
      await nextTick()

      expect(onQuery).not.toHaveBeenCalled()
    })
  })

  it('re-runs the current query on refresh, for a retry button', async () => {
    const onQuery = spyQuery()
    const table = makeTable(onQuery)
    await nextTick()
    onQuery.mockClear()

    await table.refresh()

    expect(onQuery).toHaveBeenCalledTimes(1)
  })
})
