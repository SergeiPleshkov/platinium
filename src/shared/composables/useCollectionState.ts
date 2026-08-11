import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { ApiError, isAbortError } from '@/shared/api'
import {
  DEFAULT_PER_PAGE,
  type AsyncStatus,
  type ListMeta,
  type ListResponse,
} from '@/shared/types/api'

/**
 * State and derived flags shared by every paginated collection store, so the three entities
 * cannot drift apart on `isEmpty`, `isInitialising` and friends.
 */

/**
 * A buffer slot whose page has not been fetched yet.
 *
 * The buffer is length-`total` from the first response, so the scrollbar is honest before the
 * rows exist. A sparse array of `undefined` breaks row keying, hence a placeholder with a
 * discriminant rather than an id string to sniff.
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
  /** Splices one page into the buffer. Unlike `setResult`, never discards what is there. */
  setWindow: (response: ListResponse<TEntity>) => void
  /**
   * Loads one page into the buffer.
   *
   * **Only the first window drives the collection's status.** Calling `beginLoad` per page put
   * the whole collection into `loading` on every scroll, flashing the skeleton and re-rendering
   * the grid — the exact thing virtual scrolling exists to avoid. Later pages are background
   * fills whose failures are rethrown, so the scroller can retry without disturbing the rows.
   */
  loadWindow: (
    fetchPage: () => Promise<ListResponse<TEntity>>,
    fallbackMessage: string,
  ) => Promise<void>
  /** Drops every buffered row. Call when the query changes or a mutation invalidates order. */
  resetBuffer: () => void
  setError: (error: unknown, fallback?: string) => void
  /** Applies a server-returned record to the cached list without a full refetch. */
  upsert: (entity: TEntity & { id: string }) => void
  removeById: (id: string) => void
  /** Applies part of a record and returns the version it replaced — the rollback snapshot. */
  patch: (id: string, changes: Partial<TEntity>) => TEntity | null
  /**
   * Shows a change before the server agrees, and undoes it if the server refuses.
   *
   * Here rather than in each store because getting it wrong is silent: forget the rollback and
   * the screen confidently displays a value that was rejected, with nothing looking broken.
   * Rethrows after restoring, because the caller still needs the error.
   */
  optimistic: <TResult>(
    id: string,
    changes: Partial<TEntity>,
    commit: () => Promise<TResult>,
  ) => Promise<TResult>
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

  /**
   * Replaces one row wherever it is held. The list and the buffer are two views of the same
   * records; writing to only one makes a change appear to undo itself on a mode switch.
   */
  function writeRow(id: string, entity: TEntity): void {
    items.value = items.value.map((candidate) => (candidate.id === id ? entity : candidate))

    const buffered = buffer.value.findIndex((candidate) => candidate.id === id)
    if (buffered !== -1) {
      const next = buffer.value.slice()
      next[buffered] = entity
      buffer.value = next
    }
  }

  function beginLoad(): void {
    status.value = 'loading'
    // The previous error is cleared on the attempt, not on its result: a retry that is
    // still in flight should not keep showing the failure it is trying to replace.
    error.value = null
  }

  function setError(caught: unknown, fallback = 'Could not load this list. Try again.'): void {
    error.value =
      caught instanceof ApiError
        ? caught
        : new ApiError({ kind: 'network', status: 0, message: fallback, cause: caught })
    status.value = 'error'
  }

  function setWindow(response: ListResponse<TEntity>): void {
    /*
     * Re-seed on a changed total rather than patching in place. A total that moved means rows
     * shifted, so every previously fetched page is now potentially off by one — and a buffer
     * that is quietly wrong is worse than one that reloads.
     */
    if (buffer.value.length !== response.meta.total) {
      buffer.value = placeholdersFor(response.meta.total)
    }

    /*
     * In place, deliberately. Replacing the array changes its identity, and a virtual scroller
     * watches that reference to decide when to re-measure — so every arriving page tore the
     * grid down mid-scroll. Index writes stay reactive without moving the reference.
     */
    const offset = (response.meta.page - 1) * response.meta.perPage
    response.data.forEach((row, index) => {
      buffer.value[offset + index] = row
    })

    meta.value = response.meta
    status.value = 'success'
    hasLoadedOnce.value = true
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

    beginLoad,
    setError,
    setWindow,

    setResult(response) {
      items.value = response.data
      meta.value = response.meta
      status.value = 'success'
      hasLoadedOnce.value = true
    },

    async loadWindow(fetchPage, fallbackMessage) {
      const isFirstWindow = buffer.value.length === 0
      if (isFirstWindow) beginLoad()

      try {
        setWindow(await fetchPage())
      } catch (caught) {
        if (isAbortError(caught)) return

        // A first window that fails leaves nothing on screen, so it becomes the table's error
        // state. A later one leaves the rows that did arrive alone, and is retried on scroll.
        if (!isFirstWindow) throw caught
        setError(caught, fallbackMessage)
      }
    },

    resetBuffer() {
      buffer.value = []
    },

    patch(id, changes) {
      const existing = items.value.find((candidate) => candidate.id === id) ?? null
      if (existing === null) return null

      writeRow(id, { ...existing, ...changes })
      return existing
    },

    async optimistic(id, changes, commit) {
      const snapshot = items.value.find((candidate) => candidate.id === id) ?? null
      if (snapshot !== null) writeRow(id, { ...snapshot, ...changes })

      try {
        return await commit()
      } catch (caught) {
        /*
         * Restore the exact record, not the inverse of `changes`. Reconstructing the previous
         * value from the delta stops being possible as soon as more than one field is
         * involved, and gets subtly wrong when a field was already at the new value.
         */
        if (snapshot !== null) writeRow(id, snapshot)
        throw caught
      }
    },

    /*
     * Safe on the buffer as well as the list, because an edit replaces a row in place. A
     * *delete* is not — it shifts every later row — so `removeById` deliberately invalidates
     * the buffer instead of trying to patch it.
     */
    upsert(entity) {
      writeRow(entity.id, entity)
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
