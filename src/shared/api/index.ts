/**
 * The application's HTTP surface.
 *
 * Deliberately just a client and an error type. There is no generic CRUD-resource factory:
 * measured against three entities it cost more code than the direct calls it replaced, and
 * stores read more plainly when the endpoint they hit is visible at the call site. See
 * docs/DECISIONS.md — "No generic resource factory".
 */
export { ApiError, asApiError, isAbortError, type ApiErrorKind } from '@/shared/api/errors'
export { withSignal, type Resource } from '@/shared/api/types'
export {
  buildQueryString,
  configureHttp,
  http,
  request,
  resetHttpConfig,
  serialiseListQuery,
  type HttpClientConfig,
  type QueryValue,
  type RequestOptions,
} from '@/shared/api/http'
