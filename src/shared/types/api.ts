/**
 * The contract between the client and the (mock) backend.
 *
 * Every list endpoint speaks the same envelope and accepts the same query parameters, which
 * is what lets `serialiseListQuery` and `useTable` be written once and reused by every entity.
 */

export type SortOrder = 'asc' | 'desc'

/** Filters are always transported as strings; each handler parses its own. */
export type FilterValue = string | string[]

export interface ListQuery {
  search: string
  sort: string
  order: SortOrder
  page: number
  perPage: number
  filters: Record<string, FilterValue>
}

export interface ListMeta {
  total: number
  page: number
  perPage: number
  totalPages: number
}

export interface ListResponse<T> {
  data: T[]
  meta: ListMeta
}

/**
 * The error body every failing endpoint returns. `errors` maps a form field name to a
 * user-facing message, so a 422 can be projected straight back onto the form that caused it.
 */
export interface ApiErrorBody {
  message: string
  errors?: Record<string, string>
}

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export const DEFAULT_PER_PAGE = 10

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

export function createListQuery(overrides: Partial<ListQuery> = {}): ListQuery {
  return {
    search: '',
    sort: 'createdAt',
    order: 'desc',
    page: 1,
    perPage: DEFAULT_PER_PAGE,
    filters: {},
    ...overrides,
  }
}
