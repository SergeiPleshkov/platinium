import type { Event, EventPayload } from '@/features/events/types'
import { http, serialiseListQuery } from '@/shared/api'
import { withSignal, type Resource } from '@/shared/api/types'
import type { ListResponse } from '@/shared/types/api'
import type { BulkRequest, BulkResult } from '@/shared/types/bulk'

const BASE = '/events'

/**
 * Event endpoints.
 *
 * Implements the shared `Resource` contract, plus the one endpoint that is specific to this
 * entity — the distinct countries in use, which populates the filter without the client
 * having to fetch every event and derive the list itself.
 */
export const eventsApi: Resource<Event, EventPayload> & {
  bulk(payload: BulkRequest, signal?: AbortSignal): Promise<BulkResult>
  listCountries(signal?: AbortSignal): Promise<string[]>
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
  list: (query, signal) =>
    http.get<ListResponse<Event>>(BASE, {
      ...withSignal(signal),
      query: serialiseListQuery(query),
    }),

  get: (id, signal) => http.get<Event>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),

  create: (payload, signal) => http.post<Event>(BASE, payload, withSignal(signal)),

  update: (id, payload, signal) =>
    http.patch<Event>(`${BASE}/${encodeURIComponent(id)}`, payload, withSignal(signal)),

  remove: (id, signal) =>
    http.delete<void>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),

  listCountries: (signal) => http.get<string[]>(`${BASE}/countries`, withSignal(signal)),
}
