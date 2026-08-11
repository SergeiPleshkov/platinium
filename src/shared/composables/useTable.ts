import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import {
  DEFAULT_PER_PAGE,
  createListQuery,
  type FilterValue,
  type ListQuery,
  type SortOrder,
} from '@/shared/types/api'

/**
 * The query-state engine behind every list view: search, filters, sort, pagination, and
 * *only* those. Rows live in the feature's store, so the same page of data never exists twice.
 *
 * What it does own is the fiddly part: debouncing typing into one request, cancelling
 * superseded loads, resetting to page 1 when the result set changes shape, and mirroring all
 * of it in the URL so a filtered view is shareable and survives a reload.
 */

const SEARCH_DEBOUNCE_MS = 300

export interface UseTableOptions {
  /**
   * Runs whenever the query changes. The signal aborts when a newer query supersedes this
   * one, so the callee can pass it straight to the HTTP client.
   */
  onQuery: (query: ListQuery, signal: AbortSignal) => Promise<unknown>
  defaultSort: string
  defaultOrder?: SortOrder
  perPage?: number
  /**
   * Query-param names this table treats as filters. Anything else in the URL is left alone,
   * so an unrelated param (a highlighted row, a tab) survives a filter change.
   */
  filterKeys?: readonly string[]
  /** Two-way sync with the URL. Off in unit tests that have no router. */
  syncUrl?: boolean
  /** Run the first query immediately. Off when a parent must set filters first. */
  immediate?: boolean
}

export interface UseTable {
  query: ComputedRef<ListQuery>
  search: Ref<string>
  sortField: ComputedRef<string>
  sortOrder: ComputedRef<SortOrder>
  page: ComputedRef<number>
  filters: ComputedRef<Readonly<Record<string, FilterValue>>>
  hasActiveFilters: ComputedRef<boolean>
  setSort: (field: string, order?: SortOrder) => void
  toggleSort: (field: string) => void
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
  setFilter: (key: string, value: FilterValue | undefined) => void
  clearFilters: () => void
  /** Re-runs the current query, for a retry button, or after a mutation. */
  refresh: () => Promise<void>
  /**
   * Adopts a page number the server corrected, without triggering another request.
   * Deleting the last row on page 4 should land the user on page 3, not a blank table.
   */
  adoptPage: (page: number) => void
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

export function useTable(options: UseTableOptions): UseTable {
  const {
    onQuery,
    defaultSort,
    defaultOrder = 'desc',
    perPage: initialPerPage = DEFAULT_PER_PAGE,
    filterKeys = [],
    syncUrl = true,
    immediate = true,
  } = options

  const router = syncUrl ? useRouter() : undefined
  const route = syncUrl ? useRoute() : undefined

  const search = ref('')
  const sort = ref(defaultSort)
  const order = ref<SortOrder>(defaultOrder)
  const page = ref(1)
  const perPage = ref(initialPerPage)
  const filters = ref<Record<string, FilterValue>>({})

  function readFromUrl(): void {
    if (!route) return

    setSearchInternally(readString(route.query['search'], ''))
    sort.value = readString(route.query['sort'], defaultSort)
    order.value = route.query['order'] === 'asc' ? 'asc' : defaultOrder
    page.value = readNumber(route.query['page'], 1)
    perPage.value = readNumber(route.query['perPage'], initialPerPage)

    const restored: Record<string, FilterValue> = {}
    for (const key of filterKeys) {
      const value = route.query[key]
      if (Array.isArray(value)) {
        const cleaned = value.filter((item): item is string => typeof item === 'string')
        if (cleaned.length > 0) restored[key] = cleaned
      } else if (typeof value === 'string' && value !== '') {
        restored[key] = value
      }
    }
    filters.value = restored
  }

  /** Writes state back, omitting defaults so the URL stays short and readable. */
  function writeToUrl(): void {
    if (!router || !route) return

    const next: Record<string, FilterValue> = { ...filters.value }
    if (search.value !== '') next['search'] = search.value
    if (sort.value !== defaultSort) next['sort'] = sort.value
    if (order.value !== defaultOrder) next['order'] = order.value
    if (page.value !== 1) next['page'] = String(page.value)
    if (perPage.value !== initialPerPage) next['perPage'] = String(perPage.value)

    // Preserve query params this table does not own.
    const foreign: LocationQueryRaw = {}
    const owned = new Set(['search', 'sort', 'order', 'page', 'perPage', ...filterKeys])
    for (const [key, value] of Object.entries(route.query)) {
      if (!owned.has(key)) foreign[key] = value
    }

    // `replace`, not `push`: typing in a search box must not fill the back button with history.
    void router.replace({ query: { ...foreign, ...next } })
  }

  const query = computed<ListQuery>(() =>
    createListQuery({
      search: search.value,
      sort: sort.value,
      order: order.value,
      page: page.value,
      perPage: perPage.value,
      filters: filters.value,
    }),
  )

  let controller: AbortController | null = null

  async function run(): Promise<void> {
    // Cancel the request this one supersedes, so a slow earlier page cannot land last.
    controller?.abort()
    controller = new AbortController()
    if (syncUrl) writeToUrl()
    await onQuery(query.value, controller.signal)
  }

  /**
   * Applies several pieces of query state together, then issues exactly one request.
   *
   * Explicit rather than watched. A watcher flushes asynchronously, so "change the filter
   * *and* reset to page 1" queues two runs, the first for a query that was never valid, and
   * no synchronous guard suppresses it, because the guard is cleared before the watcher runs.
   */
  function commit(mutate: () => void): void {
    mutate()
    void run()
  }

  /*
   * `search` is the one piece of state callers bind directly (it is a `v-model` target), so
   * it needs a watcher. Everything else changes through the methods below.
   */
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  /*
   * Set when *we* change `search` rather than the user, restoring it from the URL, or
   * clearing it alongside the filters. Both already issue their own request, so letting the
   * watcher re-arm the debounce would fire a second, redundant one 300ms later. The watcher
   * flushes asynchronously, so the flag is cleared inside it rather than by the caller.
   */
  let searchChangeIsInternal = false

  function setSearchInternally(value: string): void {
    if (search.value === value) return
    searchChangeIsInternal = true
    search.value = value
  }

  watch(search, () => {
    if (searchChangeIsInternal) {
      searchChangeIsInternal = false
      return
    }

    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      commit(() => {
        page.value = 1
      })
    }, SEARCH_DEBOUNCE_MS)
  })

  onScopeDispose(() => {
    clearTimeout(debounceTimer)
    controller?.abort()
  })

  function setSort(field: string, nextOrder: SortOrder = 'asc'): void {
    commit(() => {
      sort.value = field
      order.value = nextOrder
      page.value = 1
    })
  }

  /** Click a header: sort ascending, then descending, then back to the default. */
  function toggleSort(field: string): void {
    if (sort.value !== field) {
      setSort(field, 'asc')
      return
    }
    if (order.value === 'asc') {
      commit(() => {
        order.value = 'desc'
      })
      return
    }
    setSort(defaultSort, defaultOrder)
  }

  function setPage(next: number): void {
    const clamped = Math.max(1, next)
    if (clamped === page.value) return
    commit(() => {
      page.value = clamped
    })
  }

  function setPerPage(next: number): void {
    commit(() => {
      perPage.value = next
      // Page 4 of 10-per-page is meaningless once the page size becomes 100.
      page.value = 1
    })
  }

  function setFilter(key: string, value: FilterValue | undefined): void {
    const next = { ...filters.value }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }

    commit(() => {
      filters.value = next
      // A narrower result set makes the current page number meaningless.
      page.value = 1
    })
  }

  function clearFilters(): void {
    clearTimeout(debounceTimer)
    commit(() => {
      filters.value = {}
      setSearchInternally('')
      page.value = 1
    })
  }

  function adoptPage(next: number): void {
    if (next === page.value) return
    // No request: the server already answered for this page.
    page.value = next
    if (syncUrl) writeToUrl()
  }

  if (syncUrl) readFromUrl()
  if (immediate) void run()

  return {
    query,
    search,
    sortField: computed(() => sort.value),
    sortOrder: computed(() => order.value),
    page: computed(() => page.value),
    filters: computed(() => filters.value),
    hasActiveFilters: computed(() => search.value !== '' || Object.keys(filters.value).length > 0),
    setSort,
    toggleSort,
    setPage,
    setPerPage,
    setFilter,
    clearFilters,
    refresh: run,
    adoptPage,
  }
}
