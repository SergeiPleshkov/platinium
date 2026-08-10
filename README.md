# Ticket Management Admin Portal

A Vue 3 admin portal for managing **Events**, **Ticket Categories** and **Tickets**, built for
the Senior Frontend Developer technical assessment.

Written as the foundation of a platform that keeps evolving rather than as a demo: the module
boundaries are enforced by lint and asserted by tests, the mock backend behaves like a real
one, and every architectural decision is recorded in [docs/DECISIONS.md](docs/DECISIONS.md)
as it was made.

---

## Contents

- [Quick start](#quick-start)
- [Docker](#docker)
- [Commands](#commands)
- [Demo credentials](#demo-credentials)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Technical decisions](#technical-decisions)
- [Assumptions and trade-offs](#assumptions-and-trade-offs)

---

## Quick start

Requires **Node ≥ 20.19** and **pnpm** (via `corepack enable`).

```bash
pnpm install
pnpm dev
```

The app runs at **http://localhost:5173**. There is no backend to start — the mock API runs
in a Service Worker in the browser and in Node for the tests, from the same handler set.

---

## Docker

Two services, one image, different build targets.

```bash
docker compose up prod
```

The built app behind nginx at **http://localhost:8080**. Non-root (uid 101), SPA fallback,
gzip, immutable caching for hashed assets, and a `/healthz` endpoint driving the container
healthcheck. Image is ~57 MB.

```bash
docker compose --profile dev up dev
```

The Vite dev server with hot reload at **http://localhost:5173**, source bind-mounted.

To build the production image directly:

```bash
docker build --target production -t ticket-admin-portal .
docker run --rm -p 8080:8080 ticket-admin-portal
```

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with the MSW worker |
| `pnpm build` | Typecheck, then production build |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | `vue-tsc` across app, test and config projects |
| `pnpm lint` | ESLint, including the architectural boundary rules |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Full suite — 357 tests |
| `pnpm test:unit` | Unit and component tests only (`src/`) |
| `pnpm test:integration` | Integration flows only (`tests/integration/`) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Coverage report |

CI runs typecheck → lint → format → test → build, then builds the Docker image, **starts it,
and curls it** — the healthcheck, the root, and a client-side deep link.

---

## Demo credentials

Authentication is mocked but genuinely enforced: a token is issued, stored server-side,
checked on every request and invalidated on logout.

| Email | Role |
|---|---|
| `admin@ticketing.test` | Administrator |
| `editor@ticketing.test` | Editor |
| `viewer@ticketing.test` | Viewer |

Password for all three: `password123`. The login page lists them and fills the form on click.

---

## Project structure

```
src/
  app/                  bootstrap: entry, router + guards, layouts, theme tokens, plugins
  shared/               cross-feature and domain-agnostic
    api/                axios client, ApiError normalisation, query serialisation
    composables/        useTable, useCollectionState, useAsyncAction, useNotifications,
                        useBreakpoint, useTheme
    ui/                 15 Base* primitives — the only place PrimeVue is imported
    utils/              money, dates — pure and fully unit-tested
    types/              API envelope and entity contracts
    validation/         our zod ↔ vee-validate adapter
  features/
    auth/  categories/  events/  tickets/  dashboard/
      types.ts  schema.ts  api.ts  store.ts  components/  pages/  index.ts
  mocks/                MSW handlers, in-memory DB, deterministic fixtures
tests/
  integration/          whole journeys through the router
  architecture/         asserts the boundary lint rules still fire
  mock-api/             the mock backend's own contract
  utils/                render helpers, viewport and contrast helpers
```

Roughly 7,100 lines of source and 4,000 of tests.

---

## Architecture

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
deliberate violations to disk, lints them, and asserts each is rejected — and also asserts
that *sanctioned* dependencies still pass, so a rule tightened until everything is forbidden
cannot masquerade as a win. The feature list is read from the filesystem at lint time, so a
new slice is covered the moment it exists.

### Where state lives

| Concern | Owner |
|---|---|
| Server data (rows, meta, status, error) | the feature's Pinia store |
| Query state (search, filters, sort, page) | `useTable` |
| Rendering | `BaseDataTable` and the page |

`useTable` deliberately owns **no data**. An earlier version held `rows` and `meta`, and so
did the store — the same page of server state in two places, free to disagree. Splitting them
removes that class of bug and gives the mandated Pinia layer real work.

`useCollectionState<T>()` supplies `items` / `meta` / `status` / `error` plus every derived
flag, and all three entity stores compose it. That is the state-and-getters layer written once
rather than copy-pasted three times; a fourth entity gets it free.

### Querying is server-side

Search, filtering, sorting and pagination all happen in the handler, in that order, behind a
`{ data, meta }` envelope with `perPage` capped at 100.
[`tests/mock-api/querying.spec.ts`](tests/mock-api/querying.spec.ts) proves it rather than
assuming: pages are disjoint, walking all 25 pages yields exactly 250 distinct ids, and
sorting picks the global extreme rather than the page's.

This is the difference between a UI that looks right at 250 rows and one that still works at
250,000.

### PrimeVue is a replaceable dependency

Feature code consumes 15 `Base*` adapters with our own prop APIs. Tests query by role, label
and visible text — never PrimeVue classnames — so the suite would survive replacing the kit.
The boundary has already earned itself twice: it caught a direct PrimeVue import in a new
dashboard component, and it forced `BaseButton` to stop leaking PrimeVue's icon-only
semantics.

### The mock backend

One handler set runs in a Service Worker for the browser and in Node for Vitest, so tests
exercise the same request path the app does. It issues and checks auth tokens, returns 422s
with field-level errors, enforces referential integrity with 409s, maintains denormalised
counts, and supports forced failures via an `x-mock-fail` header so error states are
demonstrable. See [`src/mocks/README.md`](src/mocks/README.md).

Fixtures are deterministic — fixed seed, fixed ids, frozen clock — which is what lets tests
assert on specific rows and page boundaries.

### Testing strategy

357 tests across five kinds, each with a distinct job:

| Kind | Job |
|---|---|
| Utility / schema | pure input → output, boundary values |
| Composable | reactive behaviour, debounce, cancellation, races |
| Store | state transitions against the real mock backend |
| Component | what the user sees and can do, queried by role and label |
| Integration | whole journeys through the router |
| Architecture | that the boundary rules still fire |

MSW is the only mock. No stubbed stores, no stubbed API modules, no stubbed child components
— a test needing six mocks is a design problem, not a testing problem.

---

## Technical decisions

Sixteen entries with full reasoning are in [docs/DECISIONS.md](docs/DECISIONS.md). The ones
that shaped the most code:

**PrimeVue 4.5.5, pinned — not 5.x.** PrimeVue 5 is no longer open source: it carries the
PrimeTek dual licence, requires a licence key, ships an offline verifier as a runtime
dependency, and may display a licence notice without one. 4.5.5 is the last MIT release.

**axios for transport, our own `ApiError` for the contract.** axios handles the plumbing;
`ApiError` with `fieldErrors` / `isValidation` / `isConflict` / `isRetryable` / `isAborted` is
application vocabulary. Evidence the boundary sits in the right place: swapping a hand-rolled
`fetch` wrapper for axios changed one file and all 22 API tests passed unmodified.

**No generic CRUD-resource factory.** Written out across three entities, the factory version
was 62 lines against 25 for direct calls — it cost 2.5× what it saved, and it had zero
consumers when it was written. What survives is the `Resource<T, P>` *interface*, so
cross-cutting behaviour can still be written once.

**Money is integer minor units.** Writing the tests caught a real bug in the first
implementation: `Math.round(1.005 * 100)` is 100, not 101, because `1.005 * 100` evaluates to
`100.49999999999999`. The conversion now shifts the decimal on the string form.

**Our own zod ↔ vee-validate adapter.** `@vee-validate/zod` peer-depends on zod 3 and reads
Zod 3 internals; any schema using `.default()` throws at form setup. Forty lines of adapter
beat downgrading every schema to satisfy a dependency that cannot follow us forward.

**Maximal TypeScript strictness**, including `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`. Real friction, paid deliberately.

---

## Assumptions and trade-offs

**Assumptions**

- Authentication is mocked per the brief. The session is a bearer token in `localStorage`; a
  real deployment would use an httpOnly cookie with refresh rotation.
- The mock backend is the only backend, so it ships in the production image too. Sessions live
  in memory, which means a page reload ends the session — the app handles that correctly
  (the stored token is validated on boot and discarded if the server no longer knows it).
- Currency is per-ticket with no conversion. Totals are always grouped by currency, never
  summed across them.
- Prices and dates are entered by trusted administrators; the schema guards against mistakes,
  not against hostile input.

**Trade-offs taken knowingly**

- **Relation pickers load up to 200 options** and filter client-side. Correct at this size,
  wrong past a few hundred events, where it would silently omit some. The clearest piece of
  intentional debt here — see [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md).
- **MSW is ~162 kB gzipped** in the production bundle. It is lazy-imported behind an env flag
  and only loads because this application intentionally ships its own backend.
- **Four bonus features were scoped and not built** — bulk actions, CSV export, CSV import,
  optimistic updates and RBAC. Mandatory requirements came first by design; the plan named
  the bonus phase as the cut line before any of it was written.
- **No E2E layer.** The integration tests drive the real router, real stores and real mock
  backend in jsdom, which covers the same journeys; Playwright would add real-browser
  fidelity and CI time.

---

## Documentation

| Document | Purpose |
|---|---|
| [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) | Architecture, debt, scaling, standards, AI workflow |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log, written as decisions were made |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Every brief requirement, with evidence |
| [docs/PLAN.md](docs/PLAN.md) | The phased plan the work followed |
| [src/mocks/README.md](src/mocks/README.md) | Mock API endpoints and behaviour |
| [src/features/README.md](src/features/README.md) | Feature slice anatomy and boundaries |
