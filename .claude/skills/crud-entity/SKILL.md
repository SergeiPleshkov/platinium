---
name: crud-entity
description: Scaffold or extend a full CRUD entity slice (types, zod schema, fixtures, MSW handlers, per-feature api module, Pinia store, table page, form dialog, tests) in this Vue 3 admin portal. Use when adding or reworking Events, Categories, Tickets, or any new domain entity, or when a CRUD slice is missing a layer.
---

# CRUD entity slice

Every domain entity is one vertical slice with the same layers, in the same order. Each layer
depends only on the ones above it. Skipping a layer, or inlining it somewhere else, is the
thing this skill exists to prevent.

Three slices already exist — `categories` (simplest), `events` (dates, filters, status) and
`tickets` (relations, money, import/export). **Read the closest one before writing a new one.**
Categories is the reference for the minimum; tickets for everything optional.

## The layers

Given entity `Foo` (plural `foos`):

### 1. Types — `src/features/foos/types.ts`

```ts
export interface Foo extends BaseEntity { name: string; status: FooStatus }
export type FooPayload = Omit<Foo, 'id' | 'createdAt' | 'updatedAt'>
```

IDs are `string`. Timestamps are ISO-8601 `string` at the boundary; parse to `Date` only in
formatting helpers, never leak one through the store. Money is **integer minor units** — see
`shared/utils/money.ts` and do not reinvent it.

Export `FOO_STATUSES`, `FOO_STATUS_LABELS` and `FOO_STATUS_TONES` alongside, as the other
entities do; the label always carries the meaning, colour only reinforces it.

### 2. Schema — `src/features/foos/schema.ts`

One zod schema, the single source of truth for validation, used by the form **and** by the
mock handler. Messages are user-facing copy: sentence case, say what to do, never "Invalid
input".

### 3. Fixtures — `src/mocks/fixtures/`

Deterministic: fixed ids, seeded RNG, frozen clock. No `Math.random()` at module scope — tests
assert on specific rows and page boundaries, which only works if the data cannot move.

Enough rows that pagination, sorting and filtering are visibly real.

### 4. Handlers — `src/mocks/handlers/foos.ts`

```
GET    /api/foos?search=&status=&sort=name&order=asc&page=1&perPage=10
GET    /api/foos/:id
POST   /api/foos
PATCH  /api/foos/:id
DELETE /api/foos/:id
POST   /api/foos/bulk        ← if bulk actions apply
```

Every handler starts with the same preamble, in this order:

```ts
const failure = await preflight(request)      // latency + forced-failure injection
if (failure) return failure
const auth = requireAuth(request)
if (!auth.ok) return auth.response
const forbidden = requirePermission(auth.user, 'create')   // mutations only
if (forbidden) return forbidden
```

Use `runQuery` for lists (search → filter → sort → paginate, in that order) and `handleBulk`
for bulk. Both are written once in `src/mocks/`; do not re-implement either.

Routes with a literal segment (`/bulk`, `/export`, `/import`) must be declared **before**
`/:id`, or the literal is captured as an id.

### 5. API module — `src/features/foos/api.ts`

Implements `Resource<Foo, FooPayload>`, widened by intersection for anything entity-specific:

```ts
export const foosApi: Resource<Foo, FooPayload> & {
  bulk(payload: BulkRequest, signal?: AbortSignal): Promise<BulkResult>
} = { list, get, create, update, remove, bulk }
```

Use `http` from `@/shared/api` — never bare `fetch`, never axios directly. Both are
lint-blocked outside `shared/api`. `src/shared/api/README.md` has the copyable template,
including why ids are `encodeURIComponent`-wrapped and why nothing here needs a `try`/`catch`.

> An earlier version of this skill said there was no per-feature `api.ts`. That was true when
> measured against three entities with five endpoints each, and stopped being true as soon as
> they grew `exportCsv`, `import`, `bulk` and `listCountries`. The lesson kept is not "measure
> less" but that a file is a cheaper place to be wrong than an abstraction is.

### 6. Store — `src/features/foos/store.ts`

A Pinia setup store composing `useCollectionState<Foo>()`, which supplies `items`, `buffer`,
`meta`, `status`, `error` and every derived flag. **Do not redeclare those.**

The store adds only what is genuinely this entity's:

```ts
export const useFoosStore = defineStore('foos', () => {
  const collection = useCollectionState<Foo>()

  async function fetchList(query, signal) { /* setResult, swallow aborts */ }
  function fetchWindow(query, signal) { return collection.loadWindow(/* … */) }
  async function create(payload) { /* rethrow via asApiError */ }
  // …
  return { ...collection, fetchList, fetchWindow, create, update, remove, bulk }
})
```

Two rules that differ deliberately:

- **`fetchList` never throws.** A list failure is a state the page renders (error panel,
  retry), not an exception the caller must catch.
- **Mutations always rethrow**, via `asApiError` from `@/shared/api`. The caller is a form
  that must know whether to close, and a 422 carries field errors only it can place.

Owns no DOM, no toasts, no router.

### 7. List page — `src/features/foos/pages/FoosPage.vue`

Compose, do not reimplement:

| Need | Use |
|---|---|
| query state + view mode + virtual buffer | `useListView` |
| row selection | `useRowSelection` |
| bulk execution and its reporting rules | `useBulkAction` |
| what this role may do | `usePermissions` |
| rendering | `BaseDataTable`, `BaseBulkBar`, `BaseBulkFailures` |

Required states, all of them: loading skeleton, empty (+ create CTA), no-results-for-filters
(+ clear filters), and error with retry. Gate every action on `permissions.*` and show the
"Read only" badge when the session can change nothing.

### 8. Form — `src/features/foos/components/FooFormDialog.vue`

One dialog for create and edit, driven by an optional `foo` prop. vee-validate with our own
`zodSchema()` adapter (**not** `@vee-validate/zod` — it peer-depends on zod 3). Submit disabled
while pending; server 422 field errors mapped back onto the matching inputs.

### 9. Tests

| File | Job |
|---|---|
| `features/foos/schema.spec.ts` | valid payload passes; each rule produces its message |
| `features/foos/store.spec.ts` | state transitions against the real mock backend |
| `tests/mock-api/*.spec.ts` | the endpoint's own contract, including 401/403/409/422 |
| `tests/integration/foos-crud.spec.ts` | create → see it → edit → see the change → delete |

MSW is the only mock. No stubbed stores, no stubbed API modules, no stubbed children.

## Wiring a new entity in

1. Route in `src/app/router/routes.ts`, lazy-loaded, under the authenticated layout.
2. **`NAVIGATION` in the same file** — the sidebar reads it; never hardcode a path in a feature.
3. Register handlers in `src/mocks/handlers/index.ts`.
4. Public barrel `src/features/foos/index.ts` — other features import only from here.
5. Tick the boxes in `docs/REQUIREMENTS.md`.

## Before calling a slice done

- [ ] Every layer exists; none inlined into another
- [ ] Server-side search / filter / sort / pagination, verified in the network tab
- [ ] Loading, empty, no-results and error states all reachable
- [ ] Relations resolve to names, not ids — embedded by the API, not fetched per row
- [ ] Permissions gate the UI **and** are re-checked in the handler
- [ ] Delete is confirmed; referential integrity returns a 409 that explains itself
- [ ] Usable at 375px — the table becomes cards, no horizontal scroll
- [ ] `/verify` green
