import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { ApiError } from '@/shared/api'
import {
  DEFAULT_PER_PAGE,
  type AsyncStatus,
  type ListMeta,
  type ListResponse,
} from '@/shared/types/api'

/**
 * The state and derived flags every paginated collection store needs.
 *
 * This is the "state + getters" layer, written **once and shared** rather than copy-pasted
 * into each entity. Three entities would otherwise mean three identical `items`/`meta`/
 * `status`/`error` declarations and three identical `isEmpty`/`isLoading` computeds — the
 * kind of duplication that drifts the moment one of them gains a fix the others don't.
 *
 * Stores compose this and add only the actions that are genuinely theirs.
 */

/**
 * A slot in the virtual buffer whose page has not been fetched yet.
 *
 * The buffer is length-`total` from the first response, so the scrollbar is honest before the
 * rows behind it exist. Those slots need *something* renderable with a stable key — a sparse
 * array of `undefined` breaks row keying — so they get a placeholder that is distinguishable
 * by a discriminant rather than by sniffing the id string.
 */
export interface PendingRow {
  id: string
  __pending: true
}

export type BufferRow<TEntity> = TEntity | PendingRow

export function isPendingRow<TEntity extends { id: string }>(
  row: BufferRow<TEntity>,
): row is PendingRow {
  return (row as PendingRow).__pending === true
}

export interface CollectionState<TEntity> {
  /* ---- state ---- */
  items: Ref<TEntity[]>
  /**
   * The virtual-scrolling view of the same collection: every row of the current query, with
   * unfetched pages standing in as placeholders. Empty unless the view is in virtual mode.
   */
  buffer: Ref<Array<BufferRow<TEntity>>>
  meta: Ref<ListMeta>
  status: Ref<AsyncStatus>
  error: Ref<ApiError | null>

  /* ---- getters ---- */
  isLoading: ComputedRef<boolean>
  /** Loading with nothing to show yet: render skeletons, not a spinner over an empty grid. */
  isInitialising: ComputedRef<boolean>
  isEmpty: ComputedRef<boolean>
  hasError: ComputedRef<boolean>
  errorMessage: ComputedRef<string | undefined>
  total: ComputedRef<number>

  /* ---- transitions ---- */
  beginLoad: () => void
  setResult: (response: ListResponse<TEntity>) => void
  /**
   * Splices one fetched page into the virtual buffer, sizing it on the way if the total
   * changed. Unlike `setResult` it never discards what is already there — that is the whole
   * point of a buffer.
   */
  setWindow: (response: ListResponse<TEntity>) => void
  /** Drops every buffered row. Call when the query changes or a mutation invalidates order. */
  resetBuffer: () => void
  setError: (error: unknown, fallback?: string) => void
  /** Applies a server-returned record to the cached list without a full refetch. */
  upsert: (entity: TEntity & { id: string }) => void
  removeById: (id: string) => void
  reset: () => void
}

function emptyMeta(perPage: number): ListMeta {
  return { total: 0, page: 1, perPage, totalPages: 1 }
}

export function useCollectionState<TEntity extends { id: string }>(
  perPage: number = DEFAULT_PER_PAGE,
): CollectionState<TEntity> {
  const items = ref([]) as Ref<TEntity[]>
  const buffer = ref([]) as Ref<Array<BufferRow<TEntity>>>
  const meta = ref<ListMeta>(emptyMeta(perPage))
  const status = ref<AsyncStatus>('idle')
  const error = ref<ApiError | null>(null)
  const hasLoadedOnce = ref(false)

  function placeholdersFor(total: number): Array<BufferRow<TEntity>> {
    return Array.from({ length: total }, (_unused, index) => ({
      id: `__pending_${index}`,
      __pending: true as const,
    }))
  }

  return {
    items,
    buffer,
    meta,
    status,
    error,

    isLoading: computed(() => status.value === 'loading'),
    isInitialising: computed(() => status.value === 'loading' && !hasLoadedOnce.value),
    isEmpty: computed(() => status.value === 'success' && meta.value.total === 0),
    hasError: computed(() => status.value === 'error'),
    errorMessage: computed(() => error.value?.message),
    total: computed(() => meta.value.total),

    beginLoad() {
      status.value = 'loading'
      // The previous error is cleared on the attempt, not on its result: a retry that is
      // still in flight should not keep showing the failure it is trying to replace.
      error.value = null
    },

    setResult(response) {
      items.value = response.data
      meta.value = response.meta
      status.value = 'success'
      hasLoadedOnce.value = true
    },

    setWindow(response) {
      /*
       * Re-seed on a changed total rather than patching in place. A total that moved means
       * rows shifted, so every previously fetched page is now potentially off by one — and a
       * buffer that is quietly wrong is worse than one that reloads.
       */
      if (buffer.value.length !== response.meta.total) {
        buffer.value = placeholdersFor(response.meta.total)
      }

      const offset = (response.meta.page - 1) * response.meta.perPage
      const next = buffer.value.slice()
      response.data.forEach((row, index) => {
        next[offset + index] = row
      })
      buffer.value = next

      meta.value = response.meta
      status.value = 'success'
      hasLoadedOnce.value = true
    },

    resetBuffer() {
      buffer.value = []
    },

    setError(caught, fallback = 'Could not load this list. Try again.') {
      error.value =
        caught instanceof ApiError
          ? caught
          : new ApiError({ kind: 'network', status: 0, message: fallback, cause: caught })
      status.value = 'error'
    },

    upsert(entity) {
      const index = items.value.findIndex((candidate) => candidate.id === entity.id)
      if (index !== -1) {
        items.value = items.value.map((candidate) =>
          candidate.id === entity.id ? entity : candidate,
        )
      }

      /*
       * Safe on the buffer too, because an edit replaces a row in place. A *delete* is not —
       * it shifts every later row — so `removeById` deliberately invalidates the buffer
       * instead of trying to patch it.
       */
      const buffered = buffer.value.findIndex((candidate) => candidate.id === entity.id)
      if (buffered !== -1) {
        const next = buffer.value.slice()
        next[buffered] = entity
        buffer.value = next
      }
    },

    removeById(id) {
      const before = items.value.length
      items.value = items.value.filter((candidate) => candidate.id !== id)
      if (items.value.length !== before) {
        meta.value = { ...meta.value, total: Math.max(0, meta.value.total - 1) }
      }

      // Every buffered row after the deleted one has moved. Refetch beats guessing.
      buffer.value = []
    },

    reset() {
      items.value = []
      buffer.value = []
      meta.value = emptyMeta(perPage)
      status.value = 'idle'
      error.value = null
      hasLoadedOnce.value = false
    },
  }
}
