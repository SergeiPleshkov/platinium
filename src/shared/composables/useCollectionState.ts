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

export interface CollectionState<TEntity> {
  /* ---- state ---- */
  items: Ref<TEntity[]>
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
  const meta = ref<ListMeta>(emptyMeta(perPage))
  const status = ref<AsyncStatus>('idle')
  const error = ref<ApiError | null>(null)
  const hasLoadedOnce = ref(false)

  return {
    items,
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

    setError(caught, fallback = 'Could not load this list. Try again.') {
      error.value =
        caught instanceof ApiError
          ? caught
          : new ApiError({ kind: 'network', status: 0, message: fallback, cause: caught })
      status.value = 'error'
    },

    upsert(entity) {
      const index = items.value.findIndex((candidate) => candidate.id === entity.id)
      if (index === -1) return
      items.value = items.value.map((candidate) =>
        candidate.id === entity.id ? entity : candidate,
      )
    },

    removeById(id) {
      const before = items.value.length
      items.value = items.value.filter((candidate) => candidate.id !== id)
      if (items.value.length !== before) {
        meta.value = { ...meta.value, total: Math.max(0, meta.value.total - 1) }
      }
    },

    reset() {
      items.value = []
      meta.value = emptyMeta(perPage)
      status.value = 'idle'
      error.value = null
      hasLoadedOnce.value = false
    },
  }
}
