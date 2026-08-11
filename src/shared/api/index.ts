/**
 * The application's HTTP surface: one client, one error type, one contract.
 *
 * Feature code imports from `@/shared/api`, never from a file inside it. There is no generic
 * CRUD-resource factory, measured against three entities it cost more code than the direct
 * calls it replaced, and stores read more plainly when the endpoint they hit is visible at the
 * call site. What survives is `Resource<T, P>`, the interface each feature's `api.ts`
 * implements, so cross-cutting behaviour is written once.
 *
 * `./README.md` documents the layer in full, including the measurement behind that choice.
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
