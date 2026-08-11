import { defineStore } from 'pinia'
import { ref } from 'vue'

import { eventsApi } from '@/features/events/api'
import type { Event, EventPayload } from '@/features/events/types'
import { asApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import { createListQuery, type ListQuery } from '@/shared/types/api'
import type { BulkRequest, BulkResult } from '@/shared/types/bulk'
import type { EntityRef } from '@/shared/types/entity'
import { mergePinnedOption, RELATION_OPTIONS_PER_PAGE } from '@/shared/utils/options'

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

  /**
   * Lightweight `{ id, name }` pairs for relation pickers elsewhere (the ticket form, the
   * ticket filters).
   *
   * Deliberately a *separate* slice from `items`: they are the same entity but not the same
   * query. Reusing the list state would mean opening the ticket form silently replaced
   * whatever page of events the events screen was showing.
   */
  const options = ref<EntityRef[]>([])

  async function fetchList(query: ListQuery, signal?: AbortSignal): Promise<void> {
    collection.beginLoad()

    try {
      collection.setResult(await eventsApi.list(query, signal))
    } catch (caught) {
      if (isAbortError(caught)) return
      collection.setError(caught, 'Could not load events. Try again.')
    }
  }

  /** Loads one page into the virtual buffer. See the categories store for why it is separate. */
  function fetchWindow(query: ListQuery, signal?: AbortSignal): Promise<void> {
    return collection.loadWindow(
      () => eventsApi.list(query, signal),
      'Could not load events. Try again.',
    )
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

  /**
   * Loads options for Event relation pickers (ticket form, ticket filters).
   *
   * Server-backed search, not a one-shot dump: each call takes a search string and a small
   * page so names past the first hundred stay reachable. `pin` keeps the currently selected
   * ref visible when it falls outside the returned page (edit forms, active filters).
   */
  async function fetchOptions(
    args: {
      search?: string
      pin?: EntityRef | null
      signal?: AbortSignal
    } = {},
  ): Promise<void> {
    const { search = '', pin = null, signal } = args

    try {
      const response = await eventsApi.list(
        createListQuery({
          search,
          sort: 'name',
          order: 'asc',
          perPage: RELATION_OPTIONS_PER_PAGE,
        }),
        signal,
      )
      const mapped = response.data.map((event) => ({ id: event.id, name: event.name }))
      options.value = mergePinnedOption(mapped, pin)
    } catch (caught) {
      if (isAbortError(caught)) return
      options.value = pin ? [pin] : []
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

  /** Applies one action to many records. See the categories store for the contract. */
  async function bulk(payload: BulkRequest): Promise<BulkResult> {
    try {
      return await eventsApi.bulk(payload)
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

  return {
    ...collection,
    countries,
    options,
    fetchList,
    fetchWindow,
    fetchCountries,
    fetchOptions,
    create,
    update,
    remove,
    bulk,
  }
})
