import { defineStore } from 'pinia'
import { ref } from 'vue'

import { eventsApi } from '@/features/events/api'
import type { Event, EventPayload } from '@/features/events/types'
import { ApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import type { ListQuery } from '@/shared/types/api'

/**
 * The single source of truth for event data.
 *
 * Same shape as the categories store: shared collection state, plus only the actions that
 * are genuinely this entity's. The extra piece here is the country list, which several
 * screens need and which should be fetched once rather than per filter render.
 */
export const useEventsStore = defineStore('events', () => {
  const collection = useCollectionState<Event>()

  /** Distinct countries currently in use, for the filter control. */
  const countries = ref<string[]>([])

  async function fetchList(query: ListQuery, signal?: AbortSignal): Promise<void> {
    collection.beginLoad()

    try {
      collection.setResult(await eventsApi.list(query, signal))
    } catch (caught) {
      if (isAbortError(caught)) return
      collection.setError(caught, 'Could not load events. Try again.')
    }
  }

  /**
   * Loads the country filter's options.
   *
   * Failure is swallowed on purpose: an unavailable filter should degrade to "no country
   * options", not break the page that is otherwise working.
   */
  async function fetchCountries(): Promise<void> {
    try {
      countries.value = await eventsApi.listCountries()
    } catch {
      countries.value = []
    }
  }

  async function create(payload: EventPayload): Promise<Event> {
    try {
      return await eventsApi.create(payload)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function update(id: string, payload: EventPayload): Promise<Event> {
    try {
      const updated = await eventsApi.update(id, payload)
      collection.upsert(updated)
      return updated
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await eventsApi.remove(id)
      collection.removeById(id)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  return { ...collection, countries, fetchList, fetchCountries, create, update, remove }
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
