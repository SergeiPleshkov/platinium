import type { ListQuery, ListResponse } from '@/shared/types/api'

/**
 * The contract every feature's `api.ts` implements.
 *
 * Deliberately an interface, not a factory. A factory measured worse than the direct calls it
 * replaced (see ./README.md), but the *contract* is worth keeping: it guarantees all
 * three entities expose the same five operations with the same signatures, which is what lets
 * cross-cutting behaviour — optimistic updates, bulk operations, retry policies — be written
 * once against `Resource<T, P>` instead of three times. Each feature still spells out its own
 * URLs, so the endpoint being called is visible where it is called.
 */
export interface Resource<TEntity, TPayload> {
  list(query: ListQuery, signal?: AbortSignal): Promise<ListResponse<TEntity>>
  get(id: string, signal?: AbortSignal): Promise<TEntity>
  create(payload: TPayload, signal?: AbortSignal): Promise<TEntity>
  update(id: string, payload: TPayload, signal?: AbortSignal): Promise<TEntity>
  remove(id: string, signal?: AbortSignal): Promise<void>
}

/** Spreads an optional signal into request options without tripping exactOptionalPropertyTypes. */
export function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {}
}
