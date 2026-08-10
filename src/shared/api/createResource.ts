import { http, type QueryValue, type RequestOptions } from '@/shared/api/http'
import type { ListQuery, ListResponse } from '@/shared/types/api'

/**
 * A typed CRUD client for one REST resource.
 *
 * Every entity's list endpoint speaks the same envelope and the same query parameters, so
 * five near-identical hand-written methods per entity would be three copies of the same
 * mistake. Entity-specific endpoints are added alongside the resource, not inside it.
 */

export interface ResourceRequestOptions {
  signal?: AbortSignal
}

export interface Resource<TEntity, TPayload> {
  list(query: ListQuery, options?: ResourceRequestOptions): Promise<ListResponse<TEntity>>
  get(id: string, options?: ResourceRequestOptions): Promise<TEntity>
  create(payload: TPayload, options?: ResourceRequestOptions): Promise<TEntity>
  update(id: string, payload: TPayload, options?: ResourceRequestOptions): Promise<TEntity>
  remove(id: string, options?: ResourceRequestOptions): Promise<void>
}

/**
 * Flattens a `ListQuery` into request parameters.
 *
 * Filters are spread as top-level params rather than nested, so the URL stays readable and
 * shareable (`?status=on_sale&status=draft`) and matches what the handlers parse.
 */
export function serialiseListQuery(query: ListQuery): Record<string, QueryValue> {
  return {
    ...query.filters,
    search: query.search,
    sort: query.sort,
    order: query.order,
    page: query.page,
    perPage: query.perPage,
  }
}

export function createResource<TEntity, TPayload>(basePath: string): Resource<TEntity, TPayload> {
  const withSignal = (options?: ResourceRequestOptions): RequestOptions =>
    options?.signal ? { signal: options.signal } : {}

  return {
    list(query, options) {
      return http.get<ListResponse<TEntity>>(basePath, {
        ...withSignal(options),
        query: serialiseListQuery(query),
      })
    },

    get(id, options) {
      return http.get<TEntity>(`${basePath}/${encodeURIComponent(id)}`, withSignal(options))
    },

    create(payload, options) {
      return http.post<TEntity>(basePath, payload, withSignal(options))
    },

    update(id, payload, options) {
      return http.patch<TEntity>(
        `${basePath}/${encodeURIComponent(id)}`,
        payload,
        withSignal(options),
      )
    },

    async remove(id, options) {
      await http.delete<void>(`${basePath}/${encodeURIComponent(id)}`, withSignal(options))
    },
  }
}
