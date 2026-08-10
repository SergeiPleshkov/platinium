import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'

import {
  ApiError,
  abortError,
  apiErrorFromResponse,
  networkError,
  timeoutError,
} from '@/shared/api/errors'
import type { ListQuery } from '@/shared/types/api'

/**
 * The single place this application talks to the network.
 *
 * Nothing outside `shared/api` calls `fetch` or axios directly — enforced by the
 * `boundaries/no-raw-fetch` and `boundaries/no-direct-http-client` ESLint rules — so
 * authentication, timeouts, cancellation and error normalisation are applied uniformly
 * instead of being remembered at each call site.
 *
 * Axios supplies the transport and the interceptor hooks. The layer above it is ours: every
 * failure leaves this module as an `ApiError`, so no caller ever inspects
 * `error.response?.status` or has to tell an `AxiosError` from a `TypeError`.
 */

export interface HttpClientConfig {
  baseUrl: string
  /**
   * Supplies the bearer token. Injected rather than imported, because `shared/` may not
   * depend on a feature — the auth store registers itself at bootstrap. That constraint is
   * what keeps this module reusable and testable in isolation.
   */
  getAuthToken: () => string | null
  /** Called on any 401, so the app can end the session once, centrally. */
  onUnauthorized: (() => void) | null
  timeoutMs: number
}

const DEFAULTS: HttpClientConfig = {
  baseUrl: '/api',
  getAuthToken: () => null,
  onUnauthorized: null,
  timeoutMs: 15_000,
}

const config: HttpClientConfig = { ...DEFAULTS }

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>

/**
 * Serialises query parameters.
 *
 * Axios would render an array as `status[]=draft&status[]=paused`; our handlers — and every
 * conventional REST backend — expect the repeated form `status=draft&status=paused`. Empty
 * values are dropped so a cleared filter leaves no trace in the URL.
 */
export function buildQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== '' && item !== undefined && item !== null) params.append(key, String(item))
      }
      continue
    }

    params.append(key, String(value))
  }

  const serialised = params.toString()
  return serialised === '' ? '' : `?${serialised}`
}

function createInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
    headers: { accept: 'application/json' },
    /*
     * Force the fetch adapter. Axios would otherwise use XHR in the browser and Node's http
     * module under Vitest — two different transports, two sets of interception quirks. One
     * adapter means the tests exercise the same path the app does.
     */
    adapter: 'fetch',
    paramsSerializer: { serialize: (params) => buildQueryString(params).replace(/^\?/, '') },
  })

  instance.interceptors.request.use((request) => {
    const token = config.getAuthToken()
    if (token) request.headers.set('authorization', `Bearer ${token}`)
    return request
  })

  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error)
      const path = error instanceof AxiosError ? (error.config?.url ?? '') : ''

      /*
       * Session expiry is handled once, here, rather than in every store. Login itself is
       * exempt: a rejected sign-in is a form error, not an expired session, and signing out
       * mid-login would wipe the message the user needs to read.
       */
      if (apiError.isUnauthorized && !path.startsWith('/auth/login')) {
        config.onUnauthorized?.()
      }

      throw apiError
    },
  )

  return instance
}

let client = createInstance()

/** Rebuilt rather than mutated, so a config change cannot half-apply to an in-flight setup. */
export function configureHttp(overrides: Partial<HttpClientConfig>): void {
  Object.assign(config, overrides)
  client = createInstance()
}

export function resetHttpConfig(): void {
  Object.assign(config, DEFAULTS)
  client = createInstance()
}

/** Translates every axios failure mode into the one error type callers handle. */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (!(error instanceof AxiosError)) {
    return networkError(error)
  }

  // The caller superseded this request — discard it, never surface it.
  if (error.code === AxiosError.ERR_CANCELED) return abortError()

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return timeoutError(config.timeoutMs)
  }

  if (error.response) {
    return apiErrorFromResponse(error.response.status, error.response.data)
  }

  return networkError(error)
}

/**
 * Flattens a `ListQuery` into request parameters.
 *
 * Filters are spread as top-level params rather than nested, so the URL stays readable and
 * shareable (`?status=on_sale&status=draft`) and matches what the handlers parse. Reserved
 * keys are written last, so a filter named `page` cannot hijack pagination.
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

export interface RequestOptions {
  /** Repeated array values become repeated params, which is how the filters travel. */
  query?: Record<string, QueryValue>
  body?: unknown
  /** Caller-owned cancellation, for superseding an in-flight request. */
  signal?: AbortSignal
  headers?: Record<string, string>
  timeoutMs?: number
}

function toAxiosConfig(options: RequestOptions): AxiosRequestConfig {
  return {
    ...(options.query ? { params: options.query } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
  }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await client.request<T>({
    method,
    url: path,
    ...toAxiosConfig(options),
    ...(options.body === undefined ? {} : { data: options.body }),
  })

  /*
   * A 204 arrives as an empty string. Handing that to a caller typed `Promise<void>` would
   * be a lie that only shows up when someone destructures it.
   */
  if (response.status === 204 || response.data === '') {
    return undefined as T
  }

  return response.data
}

export const http = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, { ...options, ...(body === undefined ? {} : { body }) }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, { ...options, ...(body === undefined ? {} : { body }) }),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, options),
}

export { ApiError }
