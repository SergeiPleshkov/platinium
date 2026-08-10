import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'

import { ApiError, isAbortError } from '@/shared/api'
import {
  DEFAULT_PER_PAGE,
  createListQuery,
  type FilterValue,
  type ListMeta,
  type ListQuery,
  type ListResponse,
  type SortOrder,
} from '@/shared/types/api'

/**
 * The table engine every entity list is built on.
 *
 * Owns search, filters, sort and pagination, keeps them two-way synced with the URL query,
 * and cancels superseded requests. It is written once here rather than per entity because
 * the fiddly parts — debounce, race conditions, restoring state from a URL, resetting to
 * page 1 when a filter changes — are exactly the parts that get subtly wrong on the third
 * copy.
 *
 * Knows nothing about PrimeVue or any component. `BaseDataTable` renders what this produces,
 * which means the engine survives a UI-kit swap untouched.
 */

const SEARCH_DEBOUNCE_MS = 300

export interface UseTableOptions<TRow> {
  /** Stable key used to namespace nothing — but required for clear error messages. */
  resource: string
  fetcher: (query: ListQuery, signal: AbortSignal) => Promise<ListResponse<TRow>>
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
  /** Fetch immediately. Off when a parent needs to set filters first. */
  immediate?: boolean
}

export interface UseTable<TRow> {
  rows: Ref<TRow[]>
  meta: Ref<ListMeta>
  query: ComputedRef<ListQuery>
  loading: Ref<boolean>
  error: Ref<ApiError | null>
  /** True before the first successful load — drives the skeleton rather than a spinner. */
  initialising: ComputedRef<boolean>
  /** No rows and no filters: the resource is genuinely empty. */
  isEmpty: ComputedRef<boolean>
  /** No rows, but filters are applied: offer to clear them instead of a create CTA. */
  isFilteredEmpty: ComputedRef<boolean>
  hasActiveFilters: ComputedRef<boolean>
  search: Ref<string>
  setSort: (field: string, order?: SortOrder) => void
  toggleSort: (field: string) => void
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
  setFilter: (key: string, value: FilterValue | undefined) => void
  clearFilters: () => void
  reload: () => Promise<void>
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

export function useTable<TRow>(options: UseTableOptions<TRow>): UseTable<TRow> {
  const {
    fetcher,
    defaultSort,
    defaultOrder = 'desc',
    perPage: initialPerPage = DEFAULT_PER_PAGE,
    filterKeys = [],
    syncUrl = true,
    immediate = true,
  } = options

  /*
   * The router is optional so this composable can be unit-tested on its own. `useRoute`
   * returns undefined outside a router context, which is a supported configuration here.
   */
  const router = syncUrl ? useRouter() : undefined
  const route = syncUrl ? useRoute() : undefined

  const rows = ref([]) as Ref<TRow[]>
  const meta = ref<ListMeta>({ total: 0, page: 1, perPage: initialPerPage, totalPages: 1 })
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const hasLoadedOnce = ref(false)

  const search = ref('')
  const sort = ref(defaultSort)
  const order = ref<SortOrder>(defaultOrder)
  const page = ref(1)
  const perPage = ref(initialPerPage)
  const filters = ref<Record<string, FilterValue>>({})

  /** Restores state from the URL, so a shared or reloaded link shows the same view. */
  function readFromUrl(): void {
    if (!route) return

    search.value = readString(route.query['search'], '')
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

  async function load(): Promise<void> {
    // Cancel the request this one supersedes, so a slow earlier page cannot land last.
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal

    loading.value = true
    error.value = null

    try {
      const response = await fetcher(query.value, signal)
      if (signal.aborted) return

      rows.value = response.data
      meta.value = response.meta
      hasLoadedOnce.value = true

      /*
       * The server clamps an out-of-range page to the last one. Adopting its answer keeps the
       * pager honest after the final row on a page is deleted.
       */
      if (response.meta.page !== page.value) page.value = response.meta.page
    } catch (caught) {
      // A superseded request is not a failure; leave the previous rows and error alone.
      if (isAbortError(caught)) return

      error.value =
        caught instanceof ApiError
          ? caught
          : new ApiError({
              kind: 'network',
              status: 0,
              message: 'Could not load this list. Try again.',
              cause: caught,
            })
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function scheduleSearch(): void {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      page.value = 1
      void load()
    }, SEARCH_DEBOUNCE_MS)
  }

  // Typing fires one request after the pause, not one per keystroke.
  watch(search, () => {
    if (syncUrl) writeToUrl()
    scheduleSearch()
  })

  watch([sort, order, page, perPage, filters], () => {
    if (syncUrl) writeToUrl()
    void load()
  })

  onScopeDispose(() => {
    clearTimeout(debounceTimer)
    controller?.abort()
  })

  function setSort(field: string, nextOrder: SortOrder = 'asc'): void {
    sort.value = field
    order.value = nextOrder
    page.value = 1
  }

  /** Click a header: sort ascending, then descending, then back to the default. */
  function toggleSort(field: string): void {
    if (sort.value !== field) {
      setSort(field, 'asc')
      return
    }
    if (order.value === 'asc') {
      order.value = 'desc'
      return
    }
    setSort(defaultSort, defaultOrder)
  }

  function setPage(next: number): void {
    page.value = Math.max(1, next)
  }

  function setPerPage(next: number): void {
    perPage.value = next
    // Page 4 of 10-per-page is meaningless once the page size becomes 100.
    page.value = 1
  }

  function setFilter(key: string, value: FilterValue | undefined): void {
    const next = { ...filters.value }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
    filters.value = next
    // A narrower result set makes the current page number meaningless.
    page.value = 1
  }

  function clearFilters(): void {
    filters.value = {}
    search.value = ''
    page.value = 1
  }

  if (syncUrl) readFromUrl()
  if (immediate) void load()

  return {
    rows,
    meta,
    query,
    loading,
    error,
    initialising: computed(() => loading.value && !hasLoadedOnce.value),
    isEmpty: computed(
      () =>
        hasLoadedOnce.value && meta.value.total === 0 && !hasFilters(search.value, filters.value),
    ),
    isFilteredEmpty: computed(
      () =>
        hasLoadedOnce.value && meta.value.total === 0 && hasFilters(search.value, filters.value),
    ),
    hasActiveFilters: computed(() => hasFilters(search.value, filters.value)),
    search,
    setSort,
    toggleSort,
    setPage,
    setPerPage,
    setFilter,
    clearFilters,
    reload: load,
  }
}

function hasFilters(search: string, filters: Record<string, FilterValue>): boolean {
  return search !== '' || Object.keys(filters).length > 0
}
