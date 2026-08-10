import type { TicketPayload, TicketWithRelations } from '@/features/tickets/types'
import { http, serialiseListQuery } from '@/shared/api'
import { withSignal, type Resource } from '@/shared/api/types'
import type { ListQuery, ListResponse } from '@/shared/types/api'
import type { BulkRequest, BulkResult } from '@/shared/types/bulk'

const BASE = '/tickets'

/**
 * Ticket endpoints.
 *
 * The entity type is `TicketWithRelations`: every read returns the event and category
 * embedded, because a table row must show names rather than ids and the alternative — a
 * request per row, or loading every event up front — stops working at the scale this
 * application is meant to represent.
 */
export const ticketsApi: Resource<TicketWithRelations, TicketPayload> & {
  bulk(payload: BulkRequest, signal?: AbortSignal): Promise<BulkResult>
  exportCsv(query: ListQuery, signal?: AbortSignal): Promise<Blob>
} = {
  /**
   * Applies one action to many records.
   *
   * A single request, not N: the server reports per record, so the client learns which
   * succeeded and why the rest did not — information a loop of individual calls would have to
   * reassemble, and would lose the moment one of them threw.
   */
  bulk: (payload: BulkRequest, signal?: AbortSignal) =>
    http.post<BulkResult>(`${BASE}/bulk`, payload, withSignal(signal)),
  /**
   * Downloads every row matching the *current query*, not the current page.
   *
   * Requested as a Blob: the file is saved, never inspected, so parsing it in the browser
   * would be pure waste — and at export scale, expensive waste.
   */
  exportCsv: (query, signal) =>
    http.get<Blob>('/tickets/export', {
      ...withSignal(signal),
      query: serialiseListQuery(query),
      responseType: 'blob',
      headers: { accept: 'text/csv' },
    }),

  list: (query, signal) =>
    http.get<ListResponse<TicketWithRelations>>(BASE, {
      ...withSignal(signal),
      query: serialiseListQuery(query),
    }),

  get: (id, signal) =>
    http.get<TicketWithRelations>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),

  create: (payload, signal) => http.post<TicketWithRelations>(BASE, payload, withSignal(signal)),

  update: (id, payload, signal) =>
    http.patch<TicketWithRelations>(
      `${BASE}/${encodeURIComponent(id)}`,
      payload,
      withSignal(signal),
    ),

  remove: (id, signal) =>
    http.delete<void>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),
}
