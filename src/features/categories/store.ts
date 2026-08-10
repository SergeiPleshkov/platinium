import { defineStore } from 'pinia'
import { ref } from 'vue'

import { categoriesApi } from '@/features/categories/api'
import type { Category, CategoryPayload } from '@/features/categories/types'
import { ApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import { createListQuery, type ListQuery } from '@/shared/types/api'
import type { EntityRef } from '@/shared/types/entity'

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
   * Lightweight `{ id, name }` pairs for relation pickers elsewhere. Kept separate from
   * `items` so loading them cannot disturb the page the categories screen is showing.
   */
  const options = ref<EntityRef[]>([])

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
   * Loads one page into the virtual buffer instead of replacing the visible page.
   *
   * Sibling of `fetchList` rather than a flag on it, because the two differ in the one thing
   * that matters: `fetchList` *replaces* what is on screen, `fetchWindow` *adds* to it. A
   * boolean parameter would hide that difference behind a call site reading `fetchList(q, true)`.
   *
   * The status rules — only the first window may put the collection into `loading` — live in
   * `loadWindow`, shared so they cannot drift between the three entities.
   */
  function fetchWindow(query: ListQuery, signal?: AbortSignal): Promise<void> {
    return collection.loadWindow(
      () => categoriesApi.list(query, signal),
      'Could not load categories. Try again.',
    )
  }

  /** Loads relation-picker options. See the note on the events store about scale. */
  async function fetchOptions(): Promise<void> {
    try {
      const response = await categoriesApi.list(
        createListQuery({ sort: 'name', order: 'asc', perPage: 200 }),
      )
      options.value = response.data.map((category) => ({ id: category.id, name: category.name }))
    } catch {
      options.value = []
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
    options,
    fetchOptions,
    fetchList,
    fetchWindow,
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
