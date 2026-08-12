# Ticket Management Admin Portal

A Vue 3 admin portal for managing **Events**, **Ticket Categories** and **Tickets**.

| | |
|---|---|
| Stack | Vue 3 · Pinia · Vue Router · TypeScript (strict) · Vite · PrimeVue · Tailwind · Docker |
| Mock API | MSW — one handler set for the browser and the tests |
| Tests | Vitest (unit through architecture) · Playwright smoke + axe |
| Component docs | Storybook, 18 `shared/ui` components with an a11y panel |
| Type safety | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` |

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

Module boundaries are enforced by lint and asserted by tests. The mock backend issues real
tokens, returns 401s and 422s with field errors, and refuses deletes that would break
referential integrity.

### Features

- **Authentication.** Login, guarded routes, session restore on reload, central 401 handling,
  three seeded roles.
- **Dashboard.** Server-aggregated stats, revenue and inventory by currency, upcoming and
  busiest events. Tiles reorder by drag or keyboard; the layout is saved per account.
- **Events, Categories, Tickets.** Full CRUD with server-side search, filters, sort and
  pagination. Relations arrive as names, not raw ids. Relation pickers search on the server and
  pin the selected option.
- **Validation and errors.** One zod schema per entity (form + mock server). Inline field
  errors, toasts, list error panels with retry, confirm before destructive actions.
- **Responsive.** Designed at 375, 768 and 1280. Tables become cards on mobile. Nav is an
  off-canvas drawer below `lg` and a collapsible icon rail above it.

### Bonus capabilities

| Capability | Behaviour |
|---|---|
| Dark mode | System-aware, persisted, applied pre-paint |
| Bulk actions | One request, `207 Multi-Status`, per-record outcomes |
| CSV import/export | Export follows the current query; import dry-runs before commit |
| Dashboard statistics | Six tiles, aggregated server-side |
| Role-based permissions | One capability matrix shared by UI and mock server |
| Optimistic UI | Applied immediately, rolled back on failure |
| Drag & drop | Dashboard tiles, with a keyboard equivalent |
| Infinite scrolling | Virtual scroller over a sparse buffer; switchable with pagination |

Also: WCAG-AA contrast covered by a test, request cancellation on superseded queries, Playwright
smoke + axe (`pnpm test:e2e`), a Storybook of the UI kit (`pnpm storybook`), and `pnpm verify`
as the local/CI quality gate.

---

## 2. Installation

Requires **Node ≥ 24** and **pnpm** (`corepack enable`).

```bash
pnpm install
pnpm dev
```

App: **http://localhost:5173**. No separate backend — MSW serves the API in the browser (and in
Node for tests). For containers, see [Docker setup](#3-docker-setup).

### Signing in

| Email | Role | Can |
|---|---|---|
| `admin@ticketing.test` | Administrator | everything, including delete |
| `editor@ticketing.test` | Editor | create, update, export, import (no delete) |
| `viewer@ticketing.test` | Viewer | read and export only |

Password for all three: `password123`. The login page lists them and fills the form on click.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL for every request |
| `VITE_ENABLE_MOCK_API` | `true` | Set `false` to point at a real backend |

---

## 3. Docker setup

**Production** (nginx):

```bash
docker compose up prod
```

→ **http://localhost:8080**. Non-root (uid 101), SPA fallback, gzip, immutable hashed assets,
`/healthz` healthcheck, security headers via [`docker/security-headers.conf`](docker/security-headers.conf).

**Development** (Vite + bind mount):

```bash
docker compose --profile dev up dev
```

→ **http://localhost:5173**.

```bash
docker build --target production -t ticket-admin-portal .
docker run --rm -p 8080:8080 ticket-admin-portal
```

CI builds the image, starts it, and curls `/healthz`, `/`, and a deep link (`/events`) so a
broken SPA fallback fails the job.

---

## 4. Development commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite + MSW at http://localhost:5173 |
| `pnpm lint` | ESLint (including architecture rules) |
| `pnpm lint:fix` | ESLint with autofix |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check (CI) |
| `pnpm typecheck` | `vue-tsc --build --force` |
| `pnpm storybook` | Storybook for the UI kit at http://localhost:6006 |
| `pnpm build:storybook` | Static Storybook into `storybook-static/` |
| `pnpm verify` | typecheck → lint → format:check → test → build |

---

## 5. Build commands

| Command | What it does |
|---|---|
| `pnpm build` | Typecheck, then production build to `dist/` |
| `pnpm preview` | Serve the production build locally |

`vite build` alone does not typecheck; `pnpm build` always runs `typecheck` first.

---

## 6. Testing commands

| Command | What it does |
|---|---|
| `pnpm test` | Full Vitest suite |
| `pnpm test:unit` | Unit/component tests under `src/` |
| `pnpm test:integration` | Integration flows under `tests/integration/` |
| `pnpm test:watch` | Vitest watch |
| `pnpm test:coverage` | Coverage report |
| `pnpm test:e2e` | Playwright smoke + axe (preview). Run `pnpm test:e2e:install` once first. |

`pnpm verify` is the gate CI runs in the `verify` job; the `docker` job needs it. Playwright is
a separate command (`pnpm test:e2e`).

---

## 7. Project structure

```
src/
  app/                  entry, router + guards, layouts, theme, plugins
  shared/
    api/                axios client, ApiError, query serialisation     ← README
    composables/        useTable, useListView, useCollectionState,
                        useEntityPage, useRelationOptionsLoader,
                        useVirtualRows, useRowSelection, useBulkAction,
                        useSortableList, useAsyncAction, …
    ui/                 Base* primitives (PrimeVue only here);
                        BaseDataTable → Grid + Cards;
                        *.stories.ts beside each component
    utils/              money, date, locale, options, CSV
    types/              API envelope, shared entity contracts
    validation/         zod → vee-validate adapter
  features/             vertical slices                                 ← README
    auth/  categories/  events/  tickets/  dashboard/
      index.ts  types.ts  schema.ts  api.ts  store.ts
      components/  pages/  composables/
  mocks/                MSW handlers, DB, fixtures                      ← README
tests/
  integration/          journeys through the router
  architecture/         boundary lint rules still fire
  mock-api/             mock backend contract without our client
  utils/                render, viewport, contrast helpers
e2e/                    Playwright smoke + axe
.storybook/             Storybook config: real theme, dark-mode toggle, a11y addon
```

Unit and component tests live next to the code. Cross-boundary tests live under `tests/`.

---

## 8. Architecture overview

### Dependency direction

```
app  →  features  →  shared
```

ESLint enforces:

- Features import other features only via `index.ts`
- Features never import `app/`
- `shared/` never imports `features/` or `app/`
- `primevue/*` only in `shared/ui` and app bootstrap
- `axios` only in `shared/api`; `fetch` nowhere else

[`tests/architecture/boundaries.spec.ts`](tests/architecture/boundaries.spec.ts) writes
deliberate violations, lints them, and asserts rejection — and that sanctioned imports still
pass.

### API layer

Documented in [`src/shared/api/README.md`](src/shared/api/README.md):

- Every failure is an `ApiError` (`isValidation`, `isConflict`, `isRetryable`, `isAborted`)
- Auth token and 401 handler are injected at bootstrap
- Calls take `AbortSignal`; superseded requests are dropped
- Feature `api.ts` modules implement `Resource<T, P>` and widen for entity-specific endpoints

### State

| Concern | Owner |
|---|---|
| Server data (rows, meta, status, error) | feature Pinia store |
| Query (search, filters, sort, page) | `useTable` (URL-synced) |
| Rendering | `BaseDataTable` + page |

`useCollectionState` is shared by all three entity stores. List pages use `useEntityPage` for
create/edit/delete dialog flow.

### Querying

Search, filter, sort and pagination run in the mock handler, in that order, behind
`{ data, meta }`. Covered by [`tests/mock-api/querying.spec.ts`](tests/mock-api/querying.spec.ts).

### UI kit

Features use `Base*` components. PrimeVue stays behind the adapter. Tests query by role, label
and text — not PrimeVue internals.

`pnpm storybook` documents all 18 of them, 79 stories, one file beside each component. Stories
run through the app's own `installPrimeVue` and `main.css`, so they show the real tokens rather
than a second approximation of the theme that would immediately start to disagree. A toolbar
toggle flips the same `.dark` class the app's theme switch does, and the a11y addon runs axe on
every story.

Only `shared/ui` has stories. That layer has no domain knowledge, so its components render from
props alone; a feature component would need a store, a router and a mock backend to render,
which is an integration test with a worse assertion model, and `tests/integration/` already
owns that.

### Mock backend

One MSW handler set for browser and Vitest: tokens, 422 field errors, 409 referential
integrity, permission checks, denormalised counts, `x-mock-fail` for demos. See
[`src/mocks/README.md`](src/mocks/README.md). Fixtures are deterministic (fixed seed, ids, clock).

### Testing strategy

| Kind | Job |
|---|---|
| Utility / schema | pure input → output |
| Composable | reactive behaviour, debounce, cancellation |
| Store | state transitions against MSW |
| Component | what the user sees, by role/label |
| Integration | journeys through the router |
| Architecture | boundary rules still fire |
| E2E | production-preview smoke + axe |

MSW is the only mock. No stubbed stores, API modules or child components.

---

## 9. Technical decisions

Layer READMEs and code comments hold the rest.
[TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) answers the brief’s review questions.

### PrimeVue 4.5.5 (MIT), not 5.x

PrimeVue 5 is dual-licensed and needs a licence key. 4.5.5 is the last MIT release.

### axios for transport; `ApiError` for the contract

Stores ask `error.isValidation`, never `error.response?.status`. Transport can change without
touching callers.

### `Resource<T, P>`, not a resource factory

Each feature spells its URLs and implements the shared contract. Cross-cutting code targets the
interface; endpoints stay visible where they are called.

### Money as integer minor units

Cents only; conversion shifts the decimal string, never multiplies floats.
`shared/utils/money.ts` is the only conversion site. Locale comes from `getAppLocale()`.

### zod owns validation; vee-validate runs the form

One schema per entity feeds the form, the mock handler (`parseBody`), and inferred types. A
small adapter bridges zod 4 to vee-validate until Standard Schema support lands.

### TypeScript at maximum strictness

Including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

### Accessibility as correctness

Keyboard path for dashboard reorder; colour never sole meaning; one live region per
announcement (`BaseSpinner` has `decorative` when nested).

---

## 10. Assumptions and trade-offs

**Assumptions**

- Auth is mocked (bearer token in `localStorage`). Production would use httpOnly cookies with
  refresh rotation.
- MSW is the only backend and ships in the image. Sessions are in-memory; a restart invalidates
  them. The app validates the stored token on boot and drops unknowns.
- Currency is per-ticket with no conversion. Totals group by currency and never sum across them.
- Prices and dates are entered by trusted admins. Schemas catch mistakes, not hostile input.

**Trade-offs**

- **MSW in the production bundle**, lazy-loaded behind `VITE_ENABLE_MOCK_API`.
- **Drag ordering on dashboard tiles only.** Manual row order would fight sortable columns.
- **CSV import is tickets-only.** Bulk helpers are generic; other entities are wiring, not design.
- **Playwright is local (`pnpm test:e2e`).** CI runs Vitest + Docker curl smoke.
- **Locale defaults to `en-GB`** via `getAppLocale()`. There is no preference UI yet; a few
  call sites still pass `'en-GB'` directly.
- **View-mode switch is labelled DEMO.** Both pagination and virtual scroll ship for comparison;
  a product would pick one strategy per screen.
- **`pageValueByCurrency` is page-scoped** and labelled as such. Dashboard stats are the
  server totals.

---

## Further documentation

| Document | Purpose |
|---|---|
| [TECHNICAL_REVIEW.md](TECHNICAL_REVIEW.md) | Architecture, debt, scaling, standards, AI workflow |
| [src/shared/api/README.md](src/shared/api/README.md) | Reusable API layer |
| [src/features/README.md](src/features/README.md) | Feature slice anatomy |
| [src/mocks/README.md](src/mocks/README.md) | Mock API behaviour |
