import { DEFAULT_PER_PAGE, type ListResponse, type SortOrder } from '@/shared/types/api'

/**
 * The server-side query engine.
 *
 * Every list endpoint runs its collection through this, in a fixed order:
 * **search → filter → sort → paginate**. The order matters — paginating before filtering
 * would return the wrong page, and `meta.total` has to describe the filtered set, not the
 * whole table, or the pager will show pages that don't exist.
 *
 * This lives on the server side of the boundary on purpose. Shipping 250 tickets to the
 * browser and filtering there would look identical in the UI and would be the wrong answer
 * to the scaling question the brief asks: at 250,000 rows only the server can do this.
 */

/** Largest page a client may request, so a hostile `perPage=100000` can't be used to dump the table. */
const MAX_PER_PAGE = 100

export type SortValue = string | number | boolean | null | undefined

export interface QueryConfig<T> {
  /** Fields whose combined text is matched against `search`, case-insensitively. */
  searchable: (item: T) => Array<string | undefined>
  /** Query-param name → predicate. Only params present in the URL are applied. */
  filters?: Record<string, (item: T, value: string) => boolean>
  /** Sort key → the comparable value to sort by. Keys not listed here are rejected. */
  sortable: Record<string, (item: T) => SortValue>
  defaultSort: string
  defaultOrder?: SortOrder
}

export interface ParsedQuery {
  search: string
  sort: string
  order: SortOrder
  page: number
  perPage: number
}

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max === undefined ? parsed : Math.min(parsed, max)
}

function compare(a: SortValue, b: SortValue): number {
  // Nulls sort last regardless of direction — an empty cell is never "the smallest value".
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1

  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)

  // `localeCompare` with `numeric` so "Item 2" precedes "Item 10".
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/**
 * Search → filter → sort, with no pagination.
 *
 * Split out so the export endpoints can reuse the *exact* selection the table is showing.
 * An export that filtered differently from the grid it was launched from is worse than no
 * export, and the divergence only surfaces when somebody reconciles a spreadsheet by hand.
 */
export function applyQuery<T>(items: readonly T[], url: URL, config: QueryConfig<T>): T[] {
  const params = url.searchParams

  const search = (params.get('search') ?? '').trim().toLowerCase()
  const requestedSort = params.get('sort') ?? config.defaultSort
  const sort = requestedSort in config.sortable ? requestedSort : config.defaultSort
  const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc'

  // 1. Search
  let result = search
    ? items.filter((item) =>
        config
          .searchable(item)
          .some((field) => field !== undefined && field.toLowerCase().includes(search)),
      )
    : [...items]

  // 2. Filters
  for (const [key, predicate] of Object.entries(config.filters ?? {})) {
    const values = params.getAll(key).filter((value) => value !== '')
    if (values.length === 0) continue

    // Repeated params are OR'd within a field, AND'd across fields — the behaviour a
    // multi-select filter bar implies.
    result = result.filter((item) => values.some((value) => predicate(item, value)))
  }

  // 3. Sort
  const selector = config.sortable[sort]
  if (selector) {
    const direction = order === 'asc' ? 1 : -1
    result.sort((a, b) => {
      const primary = compare(selector(a), selector(b))
      if (primary !== 0) return primary * direction
      // Stable tiebreak on the default key, so equal values never shuffle between requests.
      const fallback = config.sortable[config.defaultSort]
      return fallback ? compare(fallback(a), fallback(b)) : 0
    })
  }

  return result
}

export function runQuery<T>(
  items: readonly T[],
  url: URL,
  config: QueryConfig<T>,
): ListResponse<T> & { query: ParsedQuery } {
  const params = url.searchParams

  const search = (params.get('search') ?? '').trim().toLowerCase()
  const requestedSort = params.get('sort') ?? config.defaultSort
  // An unknown sort key falls back to the default rather than 400ing: a stale bookmark
  // should still render a sensible list.
  const sort = requestedSort in config.sortable ? requestedSort : config.defaultSort
  const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc'
  const perPage = parsePositiveInt(params.get('perPage'), DEFAULT_PER_PAGE, MAX_PER_PAGE)

  // Steps 1–3: search, filter, sort — shared with the export endpoints.
  const result = applyQuery(items, url, config)

  // 4. Paginate — after filtering, so `total` describes what the user is actually looking at.
  const total = result.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  // Clamp rather than return an empty page: deleting the last row on page 4 should show
  // page 3, not a blank table.
  const page = Math.min(parsePositiveInt(params.get('page'), 1), totalPages)
  const start = (page - 1) * perPage

  return {
    data: result.slice(start, start + perPage),
    meta: { total, page, perPage, totalPages },
    query: { search, sort, order, page, perPage },
  }
}
