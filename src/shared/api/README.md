# The API layer

Every network call in this application goes through this directory. Nothing outside it calls
`fetch` or imports axios. Both are blocked by ESLint (`boundaries/no-raw-fetch`,
`boundaries/no-direct-http-client`), and the block is asserted by
[`tests/architecture/boundaries.spec.ts`](../../../tests/architecture/boundaries.spec.ts).

One choke point is what makes authentication, cancellation, timeouts and error normalisation
properties of the layer instead of things each call site has to remember.

```
                    feature store            ← catches ApiError, sets state
                          │
              features/<name>/api.ts         ← URLs, typed as Resource<T, P>
                          │
   ┌──────────────────────┴──────────────────────┐
   │                shared/api                   │
   │  http.ts     client, interceptors, query    │
   │  errors.ts   ApiError, the only failure     │
   │  types.ts    Resource<T, P> contract        │
   └──────────────────────┬──────────────────────┘
                        axios
```

## The four files

| File | Owns |
|---|---|
| `http.ts` | the single axios instance, its interceptors, `serialiseListQuery`, `buildQueryString` |
| `errors.ts` | `ApiError` and every constructor that produces one |
| `types.ts` | `Resource<T, P>`, the contract each feature's `api.ts` implements |
| `index.ts` | the public surface. Feature code imports from `@/shared/api`, never a file inside it. |

## What the client guarantees

**One shape for every failure.** A `TypeError` from a dropped connection, an axios timeout, a
422 with field errors and a 500 all leave this layer as an `ApiError`. Callers never inspect
`error.response?.status`, never have to tell an `AxiosError` from a thrown string, and never
render `[object Object]`.

```ts
class ApiError extends Error {
  kind: 'http' | 'network' | 'timeout' | 'aborted' | 'parse'
  status: number                          // 0 when the request never got a response
  fieldErrors: Record<string, string>     // populated from a 422, empty otherwise
  get isValidation(): boolean             // project these back onto the form
  get isUnauthorized(): boolean           // sign out, do not retry
  get isConflict(): boolean               // state refused it, e.g. event still has tickets
  get isRetryable(): boolean              // network, timeout, or 5xx
  get isAborted(): boolean                // we superseded it; ignore, never surface
}
```

Those getters are application vocabulary, not HTTP trivia. A store asks
`if (error.isValidation)`, so the day the backend starts returning 400 for validation, the
answer changes in one place.

**Messages are written for users, not for logs.** The server's own message wins when it sent
one, because it knows things the client does not, such as which event blocked a delete.
Otherwise a status-keyed table supplies the copy, and it never leaks a status code or a stack
trace into the UI.

**Auth is injected, not imported.** `shared/` may not depend on a feature, so the client takes
`getAuthToken` and `onUnauthorized` as configuration and the app bootstrap wires the auth store
in ([`src/app/main.ts`](../../app/main.ts)). That constraint is what keeps this module testable
in isolation and reusable in another app.

**401 is handled once.** A response interceptor ends the session centrally. `/auth/login` is
exempt: a rejected sign-in is a form error, not an expired session, and signing out mid-login
would wipe the message the user needs to read.

**Cancellation is first class.** Every method takes an `AbortSignal`. A superseded request
becomes `kind: 'aborted'` and is dropped instead of surfaced, which is what keeps debounced
search and virtual-scroll paging free of stale-response races.

**Query strings are serialised our way.** Axios would render an array as
`status[]=draft&status[]=paused`, and the handlers, like most conventional REST backends, expect
the repeated form. `buildQueryString` also drops empty values, so a cleared filter leaves no
trace in the URL. `serialiseListQuery` writes the reserved keys last, so a filter named `page`
cannot hijack pagination.

**One transport in both runtimes.** The fetch adapter is forced, so Vitest exercises the same
code path the browser does instead of Node's `http` module.

## The `Resource<T, P>` contract

```ts
export interface Resource<TEntity, TPayload> {
  list(query: ListQuery, signal?: AbortSignal): Promise<ListResponse<TEntity>>
  /**
   * Detail fetch. Implemented on every CRUD `api.ts` so the contract stays complete; no
   * store calls it yet because the UI is list-and-dialog rather than a detail route.
   * Keep it — a detail view should not have to invent the endpoint.
   */
  get(id: string, signal?: AbortSignal): Promise<TEntity>
  create(payload: TPayload, signal?: AbortSignal): Promise<TEntity>
  update(id: string, payload: TPayload, signal?: AbortSignal): Promise<TEntity>
  remove(id: string, signal?: AbortSignal): Promise<void>
}
```

Each feature implements it and widens it by intersection for what belongs to that entity alone:

```ts
export const ticketsApi: Resource<TicketWithRelations, TicketPayload> & {
  bulk(payload: BulkRequest, signal?: AbortSignal): Promise<BulkResult>
  import(payload: ImportRequest, signal?: AbortSignal): Promise<ImportResult>
  exportCsv(query: ListQuery, signal?: AbortSignal): Promise<Blob>
} = { list, get, create, update, remove, bulk, import: importRows, exportCsv }
```

**It is an interface, not a factory, and that was measured.** Written out across three entities,
a `createResource()` factory came to more than twice the code of the direct calls it replaced,
had no consumers at the time it was written, and pushed the URL being called out of the file
doing the calling. What survives is the contract, which is the part that pays:
`useCollectionState`, the bulk composable and the optimistic-update helper are each written once
against `Resource<T, P>` instead of three times.

## Adding an endpoint

```ts
// src/features/foos/api.ts
import { http, serialiseListQuery, withSignal, type Resource } from '@/shared/api'

const BASE = '/foos'

export const foosApi: Resource<Foo, FooPayload> = {
  list: (query, signal) =>
    http.get<ListResponse<Foo>>(BASE, { ...withSignal(signal), query: serialiseListQuery(query) }),
  get: (id, signal) => http.get<Foo>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),
  create: (payload, signal) => http.post<Foo>(BASE, payload, withSignal(signal)),
  update: (id, payload, signal) =>
    http.patch<Foo>(`${BASE}/${encodeURIComponent(id)}`, payload, withSignal(signal)),
  remove: (id, signal) =>
    http.delete<void>(`${BASE}/${encodeURIComponent(id)}`, withSignal(signal)),
}
```

Ids are `encodeURIComponent`-wrapped, `withSignal` keeps `exactOptionalPropertyTypes` happy, and
nothing here needs a `try`/`catch`. The store handles `ApiError`, and there is only one kind.

## How stores consume it

Two rules, applied the same way across all three entity stores:

- **`fetchList` never throws.** A failed list is a state the page renders, with an error panel
  and a retry button, not an exception every caller has to remember to catch. Aborts are
  swallowed.
- **Mutations always rethrow**, through `asApiError(caught, fallback)`. The caller is a form that
  has to decide whether to close, and a 422 carries field errors only it can place.

## Swapping the transport

The layer has already earned its keep once. The first implementation was a hand-rolled `fetch`
wrapper. Replacing it with axios changed one file, `http.ts`, and every test in this layer passed
unmodified. That is the evidence the boundary is drawn in the right place.

## Tests

[`http.spec.ts`](http.spec.ts) covers the client against MSW instead of a stub: header
injection, the 401 hook and its login exemption, array and empty-value serialisation, 204
handling, blob responses, timeout and network normalisation, abort classification, and 422
field-error extraction. [`tests/mock-api/`](../../../tests/mock-api/) then tests the backend's
contract separately, without this client in the way.
