---
name: crud-entity
description: Scaffold or extend a full CRUD entity slice (types, zod schema, fixtures, MSW handlers, Pinia store with its endpoint calls, table page, form dialog, tests) in this Vue 3 admin portal. Use when adding or reworking Events, Categories, Tickets, or any new domain entity, or when a CRUD slice is missing a layer.
---

# CRUD entity slice

Every domain entity in this app is one vertical slice with the same eight layers, in the same
order. Build them in order — each layer only depends on the ones above it. Skipping a layer
or inlining it somewhere else is the thing this skill exists to prevent.

## The eight layers

Given entity `Foo` (plural `foos`):

### 1. Types — `src/features/foos/types.ts`

```ts
export interface Foo { id: string; name: string; createdAt: string; updatedAt: string }
export type FooStatus = 'draft' | 'published' | 'archived'
export type FooPayload = Omit<Foo, 'id' | 'createdAt' | 'updatedAt'>
```

IDs are `string`. Timestamps are ISO-8601 `string` at the boundary; parse to `Date` only in
formatting helpers. Never leak `Date` objects through the store.

### 2. Schema — `src/features/foos/schema.ts`

One zod schema is the single source of truth for validation. Derive the payload type from
it (`z.infer`) so form, API and store can never drift.

```ts
export const fooSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
})
export type FooFormValues = z.infer<typeof fooSchema>
```

Messages are user-facing copy: sentence case, say what to do, never "Invalid input".

### 3. Fixtures — `src/mocks/fixtures/foos.ts`

Deterministic seed data (fixed ids, no `Math.random()` at module scope — tests must be
reproducible). Enough rows to make pagination, sorting and filtering visibly real: 40+ for
list entities, 200+ for tickets.

### 4. Handlers — `src/mocks/handlers/foos.ts`

REST-shaped, server-side semantics. The client must not receive the whole collection and
filter locally — that defeats the point of the exercise.

```
GET    /api/foos?search=&status=&sort=name&order=asc&page=1&perPage=10
GET    /api/foos/:id
POST   /api/foos
PATCH  /api/foos/:id
DELETE /api/foos/:id
```

List responses use the shared envelope `{ data: Foo[], meta: { total, page, perPage } }`.
Apply search → filter → sort → paginate, in that order, inside the handler. Add a small
artificial latency so loading states are real. Validate the body and return `422` with
`{ message, errors: Record<string, string> }` on bad input — the error path must be
exercisable, not theoretical.

### 5. Store — `src/features/foos/store.ts`

Endpoint calls live at the top of the store, using `http` from `@/shared/api` — never bare
`fetch`, and never axios directly (both are lint-blocked).

```ts
const listFoos = (query: ListQuery, signal?: AbortSignal) =>
  http.get<ListResponse<Foo>>('/foos', { query: serialiseListQuery(query), signal })
const createFoo = (payload: FooPayload) => http.post<Foo>('/foos', payload)
```

There is deliberately **no** generic resource factory and no separate `api.ts`: measured
against three entities, both cost more code than they saved, and a store reads more plainly
when the endpoint it hits is visible at the call site. An entity only graduates to its own
`api.ts` once it accumulates three or more endpoints beyond the standard five.

Pinia setup store. Owns: collection, item cache, query state, loading and error flags.
Owns no DOM, no toasts, no router.

```ts
export const useFoosStore = defineStore('foos', () => {
  const items = ref<Foo[]>([])
  const total = ref(0)
  const query = ref<ListQuery>(defaultListQuery())
  const status = ref<AsyncStatus>('idle')
  const error = ref<ApiError | null>(null)
  async function fetchList() { /* ... */ }
  async function create(payload: FooPayload) { /* ... */ }
  async function update(id: string, payload: FooPayload) { /* ... */ }
  async function remove(id: string) { /* ... */ }
  return { items, total, query, status, error, fetchList, create, update, remove }
})
```

Mutations re-fetch the current page (or patch optimistically, if optimistic UI is in scope)
and rethrow a normalised `ApiError` so the caller can decide how to surface it.

### 6. List page — `src/features/foos/pages/FoosPage.vue`

Composes `BaseDataTable` + `useTable` (the composable that owns search debounce, filter,
sort and page state, and syncs them to the URL query so a filtered view is shareable and
survives reload). The page wires store ↔ table; it does not reimplement either.

Required states, all of them: loading skeleton, empty ("no foos yet" + create CTA), no
results for the current filters (with a clear-filters action), and error with retry.

### 7. Form — `src/features/foos/components/FooFormDialog.vue`

One dialog for create and edit, driven by an optional `foo` prop. vee-validate +
`toTypedSchema(fooSchema)`. Submit disabled while pending; server-side `422` field errors
mapped back onto the matching form fields; success closes the dialog and fires a
notification.

### 8. Tests — colocated `*.spec.ts`

Minimum bar per entity, no exceptions:

- schema — valid payload passes; each rule produces its message
- store — list/create/update/delete happy paths against MSW; error path sets `error`
- form — renders, validates, emits/persists, maps a server 422 onto a field
- integration (`tests/integration/foos.spec.ts`) — a real flow through the router:
  create → see the row → edit → see the change → delete → see it gone

## Wiring a new entity in

1. Route in `src/app/router/routes.ts`, lazy-loaded, under the authenticated layout.
2. Nav entry in the portal shell.
3. Register the handlers in `src/mocks/handlers/index.ts`.
4. Tick the matching boxes in `docs/REQUIREMENTS.md`.

## Checklist before calling a slice done

- [ ] All eight layers exist; no layer inlined into another
- [ ] Server-side search / filter / sort / pagination, verified in the network tab
- [ ] Loading, empty, no-results and error states all reachable in the UI
- [ ] Relations resolve (a ticket shows its event and category names, not raw ids)
- [ ] Delete is confirmed before it fires
- [ ] Usable at 375px wide — the table collapses to cards, no horizontal scroll
- [ ] `/verify` green
