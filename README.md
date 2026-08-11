# Ticket Management Admin Portal

A Vue 3 admin portal for managing **Events**, **Ticket Categories** and **Tickets**, built for
the Senior Frontend Developer technical assessment.

| | |
|---|---|
| Stack | Vue 3 · Pinia · Vue Router · TypeScript (strict) · Vite · PrimeVue · Tailwind · Docker |
| Mock API | MSW, with one handler set serving both the browser and the tests |
| Tests | six layers: unit, composable, store, component, integration, architecture |
| Type safety | `strict` plus `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. No `any`, no suppressions. |

---

## Contents

1. [Project overview](#1-project-overview)
2. [Installation](#2-installation)
3. [Docker setup](#3-docker-setup)
4. [Development commands](#4-development-commands)
5. [Build commands](#5-build-commands)
6. [Testing commands](#6-testing-commands)
7. [Project structure](#7-project-structure)
8. [Architecture overview](#8-architecture-overview)
9. [Technical decisions](#9-technical-decisions)
10. [Assumptions and trade-offs](#10-assumptions-and-trade-offs)
11. [Further documentation](#further-documentation)

---

## 1. Project overview

An administrator signs in, lands on a dashboard of live statistics, and manages three related
entities from list screens that search, filter, sort and paginate on the server.

It is built as the foundation of a platform that will keep changing. Module boundaries are
enforced by lint and asserted by tests. The mock backend issues real tokens, returns 401s and
422s with field errors, and refuses deletes that would break referential integrity. Reasoning
that is not obvious from the code sits in a comment above the code it explains.

### What is in it

**Core**

- **Authentication.** Login page, guarded routes, session restored on reload, central 401
  handling, three seeded roles.
- **Dashboard.** Statistics, revenue and inventory by currency, upcoming and busiest events.
  Every tile can be reordered by drag or by keyboard, and the arrangement is saved to the
  account.
- **Events, Categories, Tickets.** Full CRUD, each with server-side search, filtering, sorting
  and pagination. Relations arrive resolved to names, not ids.
- **Validation and error handling.** One zod schema per entity, shared by the form and the mock
  server. Inline field messages, toasts for actions, an inline error panel with retry when a
  page fails to load, and a confirm dialog before anything destructive.
- **Responsive.** Designed at 375, 768 and 1280. Tables become stacked cards on mobile. The nav
  is an off-canvas drawer below `lg` and a collapsible icon rail above it.

**Every bonus feature on the brief's list**

| Bonus | Where |
|---|---|
| Dark mode | system-aware, persisted, applied pre-paint so a reload never flashes |
| Bulk actions | one request, `207 Multi-Status`, per-record success and failure reporting |
| CSV import/export | export honours the current query; import previews with a dry run before committing |
| Dashboard statistics | six tiles, aggregated server-side |
| Role-based permissions | one capability matrix shared by the client and the mock server |
| Optimistic UI updates | applied immediately, rolled back on failure |
| Drag & drop ordering | dashboard tiles, with a full keyboard equivalent |
| Infinite scrolling | virtual scroller over a sparse buffer, switchable against pagination from the toolbar |

Also: WCAG-AA contrast pinned by a test, request cancellation on superseded queries, and a
`/verify` quality gate that CI runs on every push.

### Requirements coverage

Every functional and technical requirement in the brief is implemented, along with every bonus
feature on its list. The architecture bullets in particular:

| Brief asks for | Answer |
|---|---|
| Scalable folder organization | vertical feature slices; see [§7](#7-project-structure) |
| Reusable components | `Base*` primitives with our own prop APIs, in [`src/shared/ui`](src/shared/ui) |
| Separation of concerns | markup, behaviour, server state and transport each have one home |
| Reusable composables | query, collection, selection and bulk logic written once in [`src/shared/composables`](src/shared/composables) |
| Clean state management | Pinia owns server data, `useTable` owns the query, neither duplicates the other |
| **Reusable API layer** | [`src/shared/api`](src/shared/api): one client, one `ApiError`, one `Resource<T, P>` contract. **[Documented here.](src/shared/api/README.md)** |
| Maintainable project structure | boundaries enforced by ESLint and asserted by tests |

---

## 2. Installation

Requires **Node ≥ 20.19** and **pnpm** (via `corepack enable`).

```bash
pnpm install
pnpm dev
```

The app runs at **http://localhost:5173**. There is no backend to start. The mock API runs in a
Service Worker in the browser, and in Node for the tests, from the same handler set.

If you would rather use containers, skip to [Docker setup](#3-docker-setup). Nothing needs to be
installed locally.

### Signing in

Authentication is mocked, but it is enforced. A token is issued, stored server-side, checked on
every request and invalidated on logout.

| Email | Role | Can |
|---|---|---|
| `admin@ticketing.test` | Administrator | everything, including delete |
| `editor@ticketing.test` | Editor | create, update, export, import. No delete. |
| `viewer@ticketing.test` | Viewer | read and export only |

The password for all three is `password123`. The login page lists them and fills the form on
click. Signing in as the viewer is the quickest way to see permissions gate the UI.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL for every request |
| `VITE_ENABLE_MOCK_API` | `true` | Set to `false` to point the app at a real backend |

---

## 3. Docker setup

Two services, one image, different build targets.

**Production**, the built app behind nginx:

```bash
docker compose up prod
```

Serves at **http://localhost:8080**. Runs non-root as uid 101, with SPA fallback, gzip,
immutable caching for hashed assets, and a `/healthz` endpoint driving the container
healthcheck.

**Development**, the Vite dev server with hot reload and the source bind-mounted:

```bash
docker compose --profile dev up dev
```

Serves at **http://localhost:5173**.

To build and run the production image directly:

```bash
docker build --target production -t ticket-admin-portal .
```

```bash
docker run --rm -p 8080:8080 ticket-admin-portal
```

CI goes further than building the image. It starts the container and curls the healthcheck, the
root, and a client-side deep link, because a Dockerfile can build cleanly and still serve
nothing.

---

## 4. Development commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with the MSW worker, at http://localhost:5173 |
| `pnpm lint` | ESLint, including the architectural boundary rules |
| `pnpm lint:fix` | ESLint with autofix |
| `pnpm format` | Prettier, write |
| `pnpm format:check` | Prettier, check only. This is what CI runs. |
| `pnpm typecheck` | `vue-tsc` across the app, test and config TypeScript projects |

---

## 5. Build commands

| Command | What it does |
|---|---|
| `pnpm build` | Typecheck, then production build to `dist/` |
| `pnpm preview` | Serve the production build locally |

`build` runs `typecheck` first on purpose. `vite build` on its own transpiles without checking
types, so a green build would tell you nothing about whether the code compiles.

---

## 6. Testing commands

| Command | What it does |
|---|---|
| `pnpm test` | The full suite |
| `pnpm test:unit` | Unit and component tests only, colocated in `src/` |
| `pnpm test:integration` | Integration flows only, in `tests/integration/` |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Coverage report |

The quality gate is all five steps in order: **typecheck → lint → format → test → build**. CI
runs the same five before it touches the Docker image.

---

## 7. Project structure

```
src/
  app/                  bootstrap: entry, router + guards, layouts, theme tokens, plugins
  shared/               cross-feature and domain-agnostic
    api/                axios client, ApiError normalisation, query serialisation  ← README
    composables/        useTable, useListView, useCollectionState, useVirtualRows,
                        useRowSelection, useBulkAction, useSortableList, useAsyncAction,
                        useNotifications, useRouteLoading, useBreakpoint, useTheme, useSidebar
    ui/                 Base* primitives. The only place PrimeVue is imported.
    utils/              money, dates, CSV. Pure and fully unit-tested.
    types/              API envelope and entity contracts
    validation/         our zod to vee-validate adapter
  features/             one vertical slice per domain  ← README
    auth/  categories/  events/  tickets/  dashboard/
      index.ts          the only thing other layers may import
      types.ts          domain types
      schema.ts         zod schemas, the single source of truth for validation
      api.ts            endpoints, typed as Resource<T, P>
      store.ts          Pinia setup store: server state, loading and error flags
      components/  pages/  composables/
  mocks/                MSW handlers, in-memory DB, deterministic fixtures  ← README
tests/
  integration/          whole journeys through the router
  architecture/         asserts the boundary lint rules still fire
  mock-api/             the mock backend's own contract, without our client in the way
  utils/                render helpers, viewport and contrast helpers
```

Unit and component tests are colocated with what they test. Anything that crosses a boundary
lives in `tests/`.

---

## 8. Architecture overview

### Dependency direction

```
app  →  features  →  shared
```

Enforced by ESLint, not by convention:

- A feature may not import another feature's internals, only its public `index.ts`.
- A feature may not import `app/`.
- `shared/` may not import `features/` or `app/`.
- `primevue/*` is importable only from `src/shared/ui/**` and the app bootstrap.
- `axios` is importable only from `src/shared/api`.
- Nothing outside `shared/api` calls `fetch`.

[`tests/architecture/boundaries.spec.ts`](tests/architecture/boundaries.spec.ts) writes
deliberate violations to disk, lints them, and asserts each one is rejected. It also asserts
that sanctioned dependencies still pass, so a rule tightened until everything is forbidden
cannot pass as a win. The feature list is read from the filesystem at lint time, so a new slice
is covered the moment it exists.

### The API layer

One client, one error type, one contract, documented in full in
[`src/shared/api/README.md`](src/shared/api/README.md). The short version:

- Every failure mode (dropped connection, timeout, 422, 500, deliberate abort) reaches callers
  as a single `ApiError` with `isValidation`, `isConflict`, `isRetryable` and `isAborted`. No
  store inspects `error.response?.status`.
- The token and the 401 handler are injected at bootstrap, since `shared/` may not depend on a
  feature. That keeps the layer reusable and independently testable.
- Every call takes an `AbortSignal`. A superseded request is dropped instead of surfaced, which
  is what keeps debounced search and virtual-scroll paging free of stale-response races.
- Each feature's `api.ts` implements `Resource<T, P>` and widens it by intersection for its own
  endpoints (`bulk`, `import`, `exportCsv`, `listCountries`). Cross-cutting behaviour is written
  once against the contract, while the URL stays visible in the file that calls it.

### Where state lives

| Concern | Owner |
|---|---|
| Server data (rows, meta, status, error) | the feature's Pinia store |
| Query state (search, filters, sort, page) | `useTable`, synced to the URL |
| Rendering | `BaseDataTable` and the page |

`useTable` owns no data, only the query. Rows and `meta` live in the store alone, so there is
one copy of any page of server state and nothing to keep in sync. It also gives the mandated
Pinia layer real work instead of a parallel cache.

`useCollectionState<T>()` supplies `items`, `buffer`, `meta`, `status` and `error`, plus the
derived flags and the optimistic-update helper. All three entity stores compose it, so that
layer is written once instead of copy-pasted three times, and a fourth entity gets it free.

### Querying is server-side

Search, filtering, sorting and pagination all happen in the handler, in that order, behind a
`{ data, meta }` envelope with `perPage` capped.
[`tests/mock-api/querying.spec.ts`](tests/mock-api/querying.spec.ts) checks this rather than
assuming it: pages are disjoint, walking every page returns the whole seeded set with no
duplicates, and sorting picks the global extreme, not the current page's.

That last one matters. A sort implemented client-side looks correct on page one and is wrong
everywhere else.

### PrimeVue is a replaceable dependency

Feature code consumes shared components with our own prop APIs. `primevue/*` is importable only
from `src/shared/ui/**` and the app bootstrap, and lint rejects it anywhere else. Tests query by
role, label and visible text, never by PrimeVue classnames, so the suite is written against the
same contract the features are and would survive replacing the kit.

The wrappers own their semantics instead of forwarding PrimeVue's. `BaseButton` decides
icon-only styling from our props, not from PrimeVue's `hasIcon && !label` heuristic, which
cannot see slot content.

### The mock backend

One handler set runs in a Service Worker for the browser and in Node for Vitest, so tests
exercise the same request path the app does. It issues and checks auth tokens, returns 422s with
field-level errors, enforces referential integrity with 409s, re-checks permissions on every
mutation, maintains denormalised counts, and supports forced failures via an `x-mock-fail`
header so error states can be demonstrated. See [`src/mocks/README.md`](src/mocks/README.md).

Fixtures are deterministic: fixed seed, fixed ids, frozen clock. That is what lets tests assert
on specific rows and page boundaries.

### Testing strategy

Six kinds of test, each with a distinct job:

| Kind | Job |
|---|---|
| Utility / schema | pure input to output, boundary values |
| Composable | reactive behaviour, debounce, cancellation, races |
| Store | state transitions against the real mock backend |
| Component | what the user sees and can do, queried by role and label |
| Integration | whole journeys through the router |
| Architecture | that the boundary rules still fire |

MSW is the only mock. No stubbed stores, no stubbed API modules, no stubbed child components. If
a test needs six mocks, the problem is usually the design under test.

---

## 9. Technical decisions

The decisions that shaped the most code. The rest are comments beside the code they explain, and
layer-level reasoning sits in the README of the layer it describes.
[TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) covers the architecture end to end.

### PrimeVue 4.5.5, pinned, not 5.x

PrimeVue 5 is no longer open source. It carries the PrimeTek dual licence, requires a licence
key, ships an offline verifier as a runtime dependency, and may display a licence notice without
one. 4.5.5 is the last MIT release.

### axios for transport, our own `ApiError` for the contract

axios handles the plumbing. `ApiError`, with `fieldErrors`, `isValidation`, `isConflict`,
`isRetryable` and `isAborted`, is application vocabulary. A store asks `if (error.isValidation)`
and never inspects `error.response?.status`, so the transport can be replaced without touching a
caller. All of it lives in `src/shared/api/http.ts`.

### A `Resource<T, P>` interface, not a resource factory

Each feature's `api.ts` spells out its own URLs and implements the shared contract, widening it
by intersection for what belongs to that entity alone (`bulk`, `import`, `exportCsv`,
`listCountries`). The contract is what lets cross-cutting behaviour be written once. A factory
generating the calls would cost more code than the calls themselves, and it would hide the
endpoint from the file making the request.

### Money is integer minor units

Prices are held as whole cents and converted by shifting the decimal on the string form, never
by multiplying. `Math.round(1.005 * 100)` returns 100, not 101, because `1.005 * 100` evaluates
to `100.49999999999999`. Float arithmetic loses a penny quietly, so `shared/utils/money.ts` is
the only place allowed to do the conversion.

### zod owns validation; vee-validate only runs the form

Each entity has one zod schema, used in three places: the form, the mock API's request handler
([`parseBody`](src/mocks/support.ts)), and the TypeScript types inferred from it. A rule like
"quantity must be a positive integer" is written once and enforced on both sides of the wire.

vee-validate's own validation could replace zod in the form, but only in the form. Its rule
objects are a form-layer concern. They cannot validate a request body in an MSW handler, and
they infer no types. Dropping zod would mean writing every rule twice, keeping the two copies in
agreement by hand, and declaring the payload types separately.

The adapter exists because `@vee-validate/zod` peer-depends on zod 3 and reads Zod 3 internals:
`_def.defaultValue()`, which is a function in Zod 3 and a value in Zod 4. Any schema using
`.default()` throws at form setup. Ours is one small file implementing vee-validate's public
`TypedSchema` interface, reaching into no private shapes. It can be deleted once vee-validate
ships Standard Schema support.

### Maximum TypeScript strictness

Including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Both cause real friction
and both were kept.

### Accessibility is treated as correctness

Drag and drop ships with an arrow-key path calling the same reorder function the drop calls,
because HTML5 drag has no keyboard equivalent at all. Colour never carries meaning on its own:
every badge states its status in words.

There is also one live region per announcement. A live region (`role="status"`) is an element a
screen reader reads aloud whenever its content changes, without the user moving focus to it. It
is how "Loading", "3 tickets deleted" or "Moved to position 2" reach someone who cannot see it
happen. Nest two of them and the same change is announced twice: sighted users see one spinner,
screen-reader users hear it read out twice. `BaseSpinner` therefore takes a `decorative` prop,
which renders it `aria-hidden` with no role, for when it sits inside a container that is already
announcing.

---

## 10. Assumptions and trade-offs

**Assumptions**

- Authentication is mocked, as the brief allows. The session is a bearer token in
  `localStorage`. A real deployment would use an httpOnly cookie with refresh rotation.
- The mock backend is the only backend, so it ships in the production image too. Sessions live
  in memory, so a server restart ends them. The app handles this: the stored token is validated
  on boot and discarded if the server no longer knows it.
- Currency is per-ticket, with no conversion. Totals are grouped by currency and never summed
  across them.
- Prices and dates are entered by trusted administrators. The schema guards against mistakes,
  not against hostile input.

**Trade-offs taken knowingly**

- **The Event and Category pickers in the ticket form load one page of options and filter in
  the browser.** With the seeded data every event fits on that page, so the dropdown is
  complete. Past 100 events it would hold only the first 100 by name, and searching for a later
  one would say "no results", which looks exactly like the event not existing. It is wrong
  rather than slow, and nothing warns anyone, which is what makes it the clearest piece of
  intentional debt here. The fix is a server-backed type-ahead; see
  [TECHNICAL_REVIEW.md §3](TECHNICAL_REVIEW.md).
- **MSW ships in the production bundle.** It is lazy-imported behind an env flag, and it only
  loads because this application deliberately ships its own backend.
- **Drag ordering covers the dashboard tiles, not table rows.** A manual row order fights the
  sortable column headers the brief asks for, and nobody has decided what a hand-placed row
  should do once the user sorts by price.
- **No E2E layer.** The integration tests drive the real router, real stores and real mock
  backend in jsdom, which covers the same journeys. Playwright would add real-browser fidelity
  and CI time.

---

## Further documentation

| Document | Purpose |
|---|---|
| [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) | Architecture, debt, scaling, standards and AI workflow: the brief's seven questions |
| [src/shared/api/README.md](src/shared/api/README.md) | The reusable API layer in detail |
| [src/features/README.md](src/features/README.md) | Feature slice anatomy and boundaries |
| [src/mocks/README.md](src/mocks/README.md) | Mock API endpoints and behaviour |
