import { defineStore } from 'pinia'
import { computed } from 'vue'

import { ticketsApi } from '@/features/tickets/api'
import type { TicketPayload, TicketWithRelations } from '@/features/tickets/types'
import { ApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import type { ListQuery } from '@/shared/types/api'

/** The single source of truth for ticket data. */
export const useTicketsStore = defineStore('tickets', () => {
  const collection = useCollectionState<TicketWithRelations>()

  /**
   * Total inventory value of the rows currently loaded, per currency.
   *
   * Deliberately scoped to the page: summing every ticket in the system is a server's job,
   * and pretending otherwise here would be exactly the client-side aggregation this
   * application argues against. The dashboard gets a real server-side figure in phase 8.
   */
  const pageValueByCurrency = computed(() => {
    const totals: Record<string, number> = {}
    for (const ticket of collection.items.value) {
      totals[ticket.currency] = (totals[ticket.currency] ?? 0) + ticket.priceMinor * ticket.quantity
    }
    return totals
  })

  async function fetchList(query: ListQuery, signal?: AbortSignal): Promise<void> {
    collection.beginLoad()

    try {
      collection.setResult(await ticketsApi.list(query, signal))
    } catch (caught) {
      if (isAbortError(caught)) return
      collection.setError(caught, 'Could not load tickets. Try again.')
    }
  }

  async function create(payload: TicketPayload): Promise<TicketWithRelations> {
    try {
      return await ticketsApi.create(payload)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function update(id: string, payload: TicketPayload): Promise<TicketWithRelations> {
    try {
      const updated = await ticketsApi.update(id, payload)
      collection.upsert(updated)
      return updated
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await ticketsApi.remove(id)
      collection.removeById(id)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  return { ...collection, pageValueByCurrency, fetchList, create, update, remove }
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
