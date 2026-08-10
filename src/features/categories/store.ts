import { defineStore } from 'pinia'

import { categoriesApi } from '@/features/categories/api'
import type { Category, CategoryPayload } from '@/features/categories/types'
import { ApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import type { ListQuery } from '@/shared/types/api'

/**
 * The single source of truth for category data.
 *
 * State and derived flags come from `useCollectionState`, which every entity store shares —
 * that is the "state + getters" layer, written once instead of copy-pasted three times. What
 * remains here is only what is genuinely specific to categories: its actions.
 *
 * The store owns the rows; `useTable` owns the query that produced them. Keeping a copy in
 * both is how two views of the same page end up disagreeing.
 */
export const useCategoriesStore = defineStore('categories', () => {
  const collection = useCollectionState<Category>()

  /**
   * Loads a page.
   *
   * Never throws: a list failure is a state the page renders (error panel, retry button), not
   * an exception the caller has to catch. Mutations below do the opposite — see there.
   */
  async function fetchList(query: ListQuery, signal?: AbortSignal): Promise<void> {
    collection.beginLoad()

    try {
      const response = await categoriesApi.list(query, signal)
      collection.setResult(response)
    } catch (caught) {
      // A superseded request is not a failure; leave the previous rows and status alone.
      if (isAbortError(caught)) return
      collection.setError(caught, 'Could not load categories. Try again.')
    }
  }

  /**
   * Mutations rethrow.
   *
   * The caller is a form that must know whether to close, and a 422 carries field errors only
   * it can place. Swallowing the error here would leave the dialog open with no explanation.
   */
  async function create(payload: CategoryPayload): Promise<Category> {
    try {
      return await categoriesApi.create(payload)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function update(id: string, payload: CategoryPayload): Promise<Category> {
    try {
      const updated = await categoriesApi.update(id, payload)
      // Patch the cached row rather than refetching the page: the server already told us.
      collection.upsert(updated)
      return updated
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await categoriesApi.remove(id)
      collection.removeById(id)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  return {
    ...collection,
    fetchList,
    create,
    update,
    remove,
  }
})

function asApiError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError({
        kind: 'network',
        status: 0,
        message: 'Something went wrong. Try again.',
        cause: caught,
      })
}
