# Ticket Management Admin Portal

A Vue 3 admin portal for managing **Events**, **Ticket Categories** and **Tickets**, built for
the Senior Frontend Developer technical assessment.

| | |
|---|---|
| **Stack** | Vue 3 · Pinia · Vue Router · TypeScript (strict) · Vite · PrimeVue · Tailwind · Docker |
| **Mock API** | MSW — one handler set for the browser *and* the tests |
| **Tests** | six layers, each with a distinct job — unit, composable, store, component, integration, architecture |
| **Type safety** | `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`; no `any`, no suppressions |

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
entities from list screens that search, filter, sort and paginate **on the server**.

Written as the foundation of a platform that keeps evolving rather than as a demo: the module
boundaries are enforced by lint and asserted by tests, the mock backend behaves like a real one
(tokens, 401s, 422s with field errors, 409s on referential integrity), and every architectural
decision that is not obvious from the code is written down beside the code it explains.

### What is in it

**Core**

- **Authentication** — login page, guarded routes, session restored on reload, central 401
  handling, three seeded roles.
- **Dashboard** — statistics, revenue and inventory by currency, upcoming and busiest events;
  every tile reorderable by drag *or* keyboard, with the arrangement saved to the account.
- **Events, Categories, Tickets** — complete CRUD, each with server-side search, filtering,
  sorting and pagination, and relations resolved to names rather than ids.
- **Validation and error handling** — one zod schema per entity, shared by the form and the
  mock server; inline field messages; toasts for actions; an inline error panel with retry for
  a failed load; a confirm dialog before anything destructive.
- **Responsive** — designed at 375 / 768 / 1280. Tables become stacked cards on mobile; the nav
  is an off-canvas drawer below `lg` and a collapsible icon rail above it.

**Every bonus feature on the brief's list**

| Bonus | Where |
|---|---|
| Dark mode | system-aware, persisted, applied pre-paint to avoid a flash |
| Bulk actions | one request, `207 Multi-Status`, per-record success/failure reporting |
| CSV import/export | export honours the current query; import previews with a dry run before committing |
| Dashboard statistics | six tiles, aggregated server-side |
| Role-based permissions | one capability matrix shared by the client and the mock server |
| Optimistic UI updates | applied immediately, rolled back on failure |
| Drag & drop ordering | dashboard tiles, with a full keyboard equivalent |
| Infinite scrolling | virtual scroller over a sparse buffer; switchable against pagination from the toolbar |

Plus: WCAG-AA contrast pinned by a test, request cancellation on superseded queries, and a
`/verify` quality gate that CI runs on every push.

### Requirements coverage

Every line of the brief is tracked with evidence in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). The architecture bullets in particular:

| Brief asks for | Answer |
|---|---|
| Scalable folder organization | vertical feature slices; [§7](#7-project-structure) |
| Reusable components | `Base*` primitives with our own prop APIs; [`src/shared/ui`](src/shared/ui) |
| Separation of concerns | markup / behaviour / server state / transport each have one home |
| Reusable composables | query, collection, selection and bulk logic each written once in [`src/shared/composables`](src/shared/composables) |
| Clean state management | Pinia owns server data, `useTable` owns the query, neither duplicates the other |
| **Reusable API layer** | [`src/shared/api`](src/shared/api) — one client, one `ApiError`, one `Resource<T, P>` contract. **[Documented here.](src/shared/api/README.md)** |
| Maintainable project structure | boundaries enforced by ESLint and asserted by tests |

---

## 2. Installation

Requires **Node ≥ 20.19** and **pnpm** (via `corepack enable`).

```bash
pnpm install
pnpm dev
```

The app runs at **http://localhost:5173**. There is no backend to start — the mock API runs in
a Service Worker in the browser, and in Node for the tests, from the same handler set.

Prefer containers? Skip to [Docker setup](#3-docker-setup); nothing needs to be installed
locally.

### Signing in

Authentication is mocked but genuinely enforced: a token is issued, stored server-side, checked
on every request and invalidated on logout.

| Email | Role | Can |
|---|---|---|
| `admin@ticketing.test` | Administrator | everything, including delete |
| `editor@ticketing.test` | Editor | create, update, export, import — not delete |
| `viewer@ticketing.test` | Viewer | read and export only |

Password for all three: `password123`. The login page lists them and fills the form on click.
Signing in as the viewer is the quickest way to see permissions gate the UI.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL for every request |
| `VITE_ENABLE_MOCK_API` | `true` | Set to `false` to point the app at a real backend instead |

---

## 3. Docker setup

Two services, one image, different build targets.

**Production** — the built app behind nginx:

```bash
docker compose up prod
```

Serves at **http://localhost:8080**. Non-root (uid 101), SPA fallback, gzip, immutable caching
for hashed assets, and a `/healthz` endpoint driving the container healthcheck.

**Development** — the Vite dev server with hot reload, source bind-mounted:

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

CI does not stop at building the image — it **starts** it and curls the healthcheck, the root,
and a client-side deep link, because an image that builds is not the same as an image that
serves.

---

## 4. Development commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with the MSW worker, at http://localhost:5173 |
| `pnpm lint` | ESLint, including the architectural boundary rules |
| `pnpm lint:fix` | ESLint with autofix |
| `pnpm format` | Prettier, write |
| `pnpm format:check` | Prettier, check only — what CI runs |
| `pnpm typecheck` | `vue-tsc` across the app, test and config TypeScript projects |

---

## 5. Build commands

| Command | What it does |
|---|---|
| `pnpm build` | Typecheck, then production build to `dist/` |
| `pnpm preview` | Serve the production build locally |

`build` runs `typecheck` first deliberately: `vite build` alone transpiles without checking
types, so a build that "passes" would prove nothing.

---

## 6. Testing commands

| Command | What it does |
|---|---|
| `pnpm test` | The full suite |
| `pnpm test:unit` | Unit and component tests only (colocated in `src/`) |
| `pnpm test:integration` | Integration flows only (`tests/integration/`) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Coverage report |

The quality gate is all of it, in order — **typecheck → lint → format → test → build** — and
that is exactly what CI runs before it touches the Docker image.

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
    ui/                 Base* primitives — the only place PrimeVue is imported
    utils/              money, dates, CSV — pure and fully unit-tested
    types/              API envelope and entity contracts
    validation/         our zod ↔ vee-validate adapter
  features/             one vertical slice per domain  ← README
    auth/  categories/  events/  tickets/  dashboard/
      index.ts          the only thing other layers may import
      types.ts          domain types
      schema.ts         zod schemas — the single source of truth for validation
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

Unit and component tests are colocated with what they test; everything that crosses a boundary
lives in `tests/`.

---

## 8. Architecture overview

### Dependency direction

```
app  →  features  →  shared
```

Enforced by ESLint, not by convention:

- A feature may not import another feature's internals — only its public `index.ts`.
- A feature may not import `app/`.
- `shared/` may not import `features/` or `app/`.
- `primevue/*` is importable **only** from `src/shared/ui/**` and the app bootstrap.
- `axios` is importable **only** from `src/shared/api`.
- Nothing outside `shared/api` calls `fetch`.

[`tests/architecture/boundaries.spec.ts`](tests/architecture/boundaries.spec.ts) writes
deliberate violations to disk, lints them, and asserts each is rejected — and also asserts that
*sanctioned* dependencies still pass, so a rule tightened until everything is forbidden cannot
masquerade as a win. The feature list is read from the filesystem at lint time, so a new slice
is covered the moment it exists.

### The API layer

One client, one error type, one contract — documented in full in
**[`src/shared/api/README.md`](src/shared/api/README.md)**. The short version:

- Every failure mode — dropped connection, timeout, 422, 500, deliberate abort — reaches
  callers as a single `ApiError` with `isValidation` / `isConflict` / `isRetryable` /
  `isAborted`. No store ever inspects `error.response?.status`.
- The token and the 401 handler are **injected** at bootstrap, because `shared/` may not depend
  on a feature. That is what keeps the layer reusable and independently testable.
- Every call takes an `AbortSignal`; a superseded request is dropped rather than surfaced, which
  is what makes debounced search and virtual-scroll paging race-free.
- Each feature's `api.ts` implements `Resource<T, P>` and widens it by intersection for its own
  endpoints (`bulk`, `import`, `exportCsv`, `listCountries`), so cross-cutting behaviour is
  written once against the contract while the URL stays visible where it is called.

### Where state lives

| Concern | Owner |
|---|---|
| Server data (rows, meta, status, error) | the feature's Pinia store |
| Query state (search, filters, sort, page) | `useTable`, synced to the URL |
| Rendering | `BaseDataTable` and the page |

`useTable` deliberately owns **no data**. An earlier version held `rows` and `meta`, and so did
the store — the same page of server state in two places, free to disagree. Splitting them
removes that class of bug and gives the mandated Pinia layer real work.

`useCollectionState<T>()` supplies `items` / `buffer` / `meta` / `status` / `error` plus every
derived flag and the optimistic-update helper, and all three entity stores compose it. That is
the state-and-getters layer written once rather than copy-pasted three times; a fourth entity
gets it free.

### Querying is server-side

Search, filtering, sorting and pagination all happen in the handler, in that order, behind a
`{ data, meta }` envelope, with `perPage` capped.
[`tests/mock-api/querying.spec.ts`](tests/mock-api/querying.spec.ts) proves it rather than
assuming: pages are disjoint, walking every page returns the whole seeded set with no
duplicates, and sorting picks the global extreme rather than the current page's.

This is the difference between a UI that looks right at demo scale and one that still works
when the table is large.

### PrimeVue is a replaceable dependency

Feature code consumes shared components with our own prop APIs. Tests query by role, label
and visible text — never PrimeVue classnames — so the suite would survive replacing the kit.
The boundary has already earned itself twice: it caught a direct PrimeVue import in a new
dashboard component, and it forced `BaseButton` to stop leaking PrimeVue's icon-only semantics.

### The mock backend

One handler set runs in a Service Worker for the browser and in Node for Vitest, so tests
exercise the same request path the app does. It issues and checks auth tokens, returns 422s with
field-level errors, enforces referential integrity with 409s, re-checks permissions on every
mutation, maintains denormalised counts, and supports forced failures via an `x-mock-fail`
header so error states are demonstrable. See [`src/mocks/README.md`](src/mocks/README.md).

Fixtures are deterministic — fixed seed, fixed ids, frozen clock — which is what lets tests
assert on specific rows and page boundaries.

### Testing strategy

Six kinds of test, each with a distinct job and none duplicating another's:

| Kind | Job |
|---|---|
| Utility / schema | pure input → output, boundary values |
| Composable | reactive behaviour, debounce, cancellation, races |
| Store | state transitions against the real mock backend |
| Component | what the user sees and can do, queried by role and label |
| Integration | whole journeys through the router |
| Architecture | that the boundary rules still fire |

MSW is the only mock. No stubbed stores, no stubbed API modules, no stubbed child components —
a test needing six mocks is a design problem, not a testing problem.

---

## 9. Technical decisions

The decisions that shaped the most code. The rest live as comments beside the code they
explain, and the layer-level reasoning sits in the README of the layer it describes.
[TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) covers the architecture end to end.

**PrimeVue 4.5.5, pinned — not 5.x.** PrimeVue 5 is no longer open source: it carries the
PrimeTek dual licence, requires a licence key, ships an offline verifier as a runtime
dependency, and may display a licence notice without one. 4.5.5 is the last MIT release.

**axios for transport, our own `ApiError` for the contract.** axios handles the plumbing;
`ApiError` with `fieldErrors` / `isValidation` / `isConflict` / `isRetryable` / `isAborted` is
application vocabulary. Evidence the boundary sits in the right place: swapping a hand-rolled
`fetch` wrapper for axios changed one file, and every test in the layer passed unmodified.

**No generic CRUD-resource factory.** Written out across three entities, the factory version
cost more than twice the code it replaced, and it had no consumers at all when it was written. What survives is the `Resource<T, P>` *interface*, so cross-cutting
behaviour can still be written once.

**Money is integer minor units.** Writing the tests caught a real bug in the first
implementation: `Math.round(1.005 * 100)` is 100, not 101, because `1.005 * 100` evaluates to
`100.49999999999999`. The conversion now shifts the decimal on the string form.

**Our own zod ↔ vee-validate adapter.** `@vee-validate/zod` peer-depends on zod 3 and reads Zod 3
internals; any schema using `.default()` throws at form setup. A small adapter of ours beat
downgrading every schema to satisfy a dependency that cannot follow us forward.

**Maximal TypeScript strictness**, including `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`. Real friction, paid deliberately.

**Accessibility treated as correctness.** Drag & drop ships with an arrow-key equivalent calling
the same function, because HTML5 drag has none. Colour never carries meaning alone. Exactly one
live region per announcement.

---

## 10. Assumptions and trade-offs

**Assumptions**

- Authentication is mocked per the brief. The session is a bearer token in `localStorage`; a
  real deployment would use an httpOnly cookie with refresh rotation.
- The mock backend is the only backend, so it ships in the production image too. Sessions live
  in memory, which means a server restart ends them — the app handles that correctly (the stored
  token is validated on boot and discarded if the server no longer knows it).
- Currency is per-ticket with no conversion. Totals are always grouped by currency, never summed
  across them.
- Prices and dates are entered by trusted administrators; the schema guards against mistakes,
  not against hostile input.

**Trade-offs taken knowingly**

- **Relation pickers load a bounded page of options** and filter client-side. Correct at the
  seeded data size, wrong past a few hundred events, where it would silently omit some. The clearest piece of intentional
  debt here — see [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md).
- **MSW ships in the production bundle.** It is lazy-imported behind an env flag and only loads
  because this application intentionally ships its own backend.
- **Drag ordering is scoped to the dashboard tiles**, not table rows: a manual row order fights
  the mandated sortable column headers, and what a hand-placed row should do once the user sorts
  by price is a product question nobody has answered.
- **No E2E layer.** The integration tests drive the real router, real stores and real mock backend
  in jsdom, which covers the same journeys; Playwright would add real-browser fidelity and CI
  time.

---

## Further documentation

| Document | Purpose |
|---|---|
| [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) | Architecture, debt, scaling, standards, AI workflow — the brief's seven questions |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Every brief requirement, with evidence |
| [src/shared/api/README.md](src/shared/api/README.md) | The reusable API layer in detail |
| [src/features/README.md](src/features/README.md) | Feature slice anatomy and boundaries |
| [src/mocks/README.md](src/mocks/README.md) | Mock API endpoints and behaviour |
