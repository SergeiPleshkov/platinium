import { defineStore } from 'pinia'
import { computed } from 'vue'

import { ticketsApi } from '@/features/tickets/api'
import type { TicketPayload, TicketStatus, TicketWithRelations } from '@/features/tickets/types'
import { asApiError, isAbortError } from '@/shared/api'
import { useCollectionState } from '@/shared/composables/useCollectionState'
import type { ListQuery } from '@/shared/types/api'
import type { BulkRequest, BulkResult } from '@/shared/types/bulk'
import type { ImportRequest, ImportResult } from '@/shared/types/import'
import { downloadBlob, timestampedFilename } from '@/shared/utils/download'

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

  /** Loads one page into the virtual buffer. See the categories store for why it is separate. */
  function fetchWindow(query: ListQuery, signal?: AbortSignal): Promise<void> {
    return collection.loadWindow(
      () => ticketsApi.list(query, signal),
      'Could not load tickets. Try again.',
    )
  }

  /**
   * Downloads every ticket matching `query` as CSV.
   *
   * Rethrows so the page can tell the admin the export failed — a download that silently does
   * nothing is indistinguishable from a browser blocking it.
   */
  async function exportCsv(query: ListQuery): Promise<void> {
    try {
      const blob = await ticketsApi.exportCsv(query)
      downloadBlob(blob, timestampedFilename('tickets', 'csv'))
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  async function create(payload: TicketPayload): Promise<TicketWithRelations> {
    try {
      return await ticketsApi.create(payload)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  /**
   * Changes one ticket's status from the row, without waiting for the server.
   *
   * The case optimism is actually for: a frequent, low-risk, one-click change where the user
   * stays on the page and a 200ms pause reads as lag. Contrast the edit dialog, which stays
   * open until the server agrees — there, optimism would buy nothing and cost the field-level
   * error messages a 422 carries.
   *
   * `collection.optimistic` owns the snapshot and the rollback; this only says what changes
   * and how to commit it.
   */
  async function setStatus(id: string, status: TicketStatus): Promise<void> {
    const ticket = collection.items.value.find((candidate) => candidate.id === id)
    if (!ticket || ticket.status === status) return

    await collection.optimistic(id, { status }, async () => {
      try {
        // The whole payload, because the endpoint validates against the full schema — the
        // mock backend is deliberately not more forgiving than a real one would be.
        const updated = await ticketsApi.update(id, {
          name: ticket.name,
          priceMinor: ticket.priceMinor,
          currency: ticket.currency,
          quantity: ticket.quantity,
          status,
          eventId: ticket.eventId,
          categoryId: ticket.categoryId,
        })
        collection.upsert(updated)
      } catch (caught) {
        throw asApiError(caught)
      }
    })
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

  /**
   * Validates rows from a file, and writes them unless this is a dry run.
   *
   * Never throws on *row* problems — those are the report, not an error. It throws only when
   * the request itself failed, which the page distinguishes because the two need different
   * words.
   */
  async function importRows(payload: ImportRequest): Promise<ImportResult> {
    try {
      return await ticketsApi.import(payload)
    } catch (caught) {
      throw asApiError(caught)
    }
  }

  /** Applies one action to many records. See the categories store for the contract. */
  async function bulk(payload: BulkRequest): Promise<BulkResult> {
    try {
      return await ticketsApi.bulk(payload)
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

  return {
    ...collection,
    pageValueByCurrency,
    fetchList,
    fetchWindow,
    setStatus,
    importRows,
    exportCsv,
    create,
    update,
    remove,
    bulk,
  }
})
