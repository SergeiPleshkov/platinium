# Implementation plan

Ticket Management Admin Portal — Senior Frontend Developer technical assessment.

Requirements inventory: [REQUIREMENTS.md](REQUIREMENTS.md). Conventions: [../CLAUDE.md](../CLAUDE.md).
Every phase ends with `/verify` green and a commit.

---

## Phase 0 — Foundation ✅ (done)

Git repo, `CLAUDE.md`, requirements traceability, skills (`crud-entity`, `vue-feature`,
`testing-vue`), workflows (`/verify`, `/phase`, `/audit-brief`), decision log, `.gitignore`.

---

## Phase 1 — Project skeleton & toolchain

Scaffold Vite + Vue 3 + TS (`strict`, `noUncheckedIndexedAccess`), path alias `@ → src`.
Tailwind + design tokens (colour scale, spacing, radii, dark-mode-ready CSS variables).
ESLint 9 flat config (`vue`, `@typescript-eslint`, `vue-a11y`, import boundaries) +
Prettier. Vitest with jsdom, coverage, Testing Library setup file. The folder tree from
`CLAUDE.md`, real not empty. `package.json` scripts matching the command table.

**Exit:** `pnpm dev` serves a shell page; typecheck, lint, an empty test run and build all pass.

## Phase 2 — Mock API & domain model

Domain types and zod schemas for Event, Category, Ticket, User. Deterministic fixtures —
~30 events, ~10 categories, ~250 tickets with real relations. In-memory MSW database with
CRUD + reset. Handlers implementing **server-side** search → filter → sort → paginate over
the shared `{ data, meta }` envelope, plus artificial latency, 422 validation errors, and a
switch to force 500s so error paths are demonstrable. One handler set, wired for both the
browser worker and the Vitest node server.

**Exit:** every endpoint exercised by a store-level test; pagination/sort/filter proven
server-side, not client-side.

## Phase 3 — App shell, API layer, auth

`shared/api`: `http.ts` (fetch wrapper, timeout, abort, auth header), `errors.ts`
(`ApiError` normalisation), `createResource.ts` (typed CRUD factory).
`shared/ui` primitives: Button, Input, Select, Textarea, Modal, Badge, Skeleton, EmptyState,
ConfirmDialog, Toast host. Core composables: `useAsyncAction`, `useNotifications`,
`useBreakpoint`.
Auth feature: login page with validation, mocked credentials, session in a Pinia store
persisted to `localStorage`, route guards, 401 interception, logout.
Portal layout: responsive sidebar (off-canvas below `lg`), topbar, user menu, router views.

**Exit:** protected routes redirect; login → dashboard → reload keeps session → logout
returns to login; all covered by an integration test.

## Phase 4 — Data table engine

The piece the three entity slices are built on, so it's built once and built well.
`useTable` composable: debounced search, typed filters, multi-column sort, pagination —
all two-way synced with the URL query, so any view is shareable and reload-safe, with
superseded requests aborted. `BaseDataTable`: typed column definitions, sortable headers,
row actions, selection (groundwork for bulk actions), loading skeleton, empty state,
no-results-for-filters state, error state with retry, and a card layout below `md`.
`BasePagination` with page-size control.

**Exit:** unit tests for `useTable` (debounce, URL round-trip, abort) and component tests
for every table state.

## Phase 5 — Categories slice

Simplest entity first — it proves the vertical-slice pattern end to end and shakes out the
table engine. Nine layers per the `crud-entity` skill: types, schema, fixtures, handlers,
API resource, store, list page, form dialog, tests (schema, store, form, integration flow).

**Exit:** full CRUD through the UI; create → edit → delete integration flow green.

## Phase 6 — Events slice

Same nine layers, plus: date-range fields with cross-field validation (end after start),
country and status filters, status badges, and a guard on deleting an event that still has
tickets (with a clear explanatory error).

**Exit:** CRUD + filtering + sorting + pagination green; date validation covered.

## Phase 7 — Tickets slice

The relational one. Adds: event and category relations rendered as names (not ids), price +
currency with correct formatting, quantity, status, filtering by event / category / status /
price range, and searchable relation selects in the form. This slice is why pagination and
server-side querying had to be real — it carries ~250 rows.

**Exit:** CRUD + all filters + relation integrity green; the full integration flow passes.

## Phase 8 — Dashboard & bonus features

Dashboard overview: KPI tiles (events, tickets, inventory value, sold-out count), tickets
per event, upcoming events, recent activity — computed server-side in MSW, not by pulling
every row to the client.
Bonus features, in the order they demonstrate the most: **dark mode** (tokens already in
place from phase 1), **dashboard statistics**, **bulk actions** (multi-select delete /
status change), **CSV export**, then **optimistic updates** and **role-based permissions**
if time allows.

**Exit:** each shipped bonus has a test; none of them destabilise the core flows.

## Phase 9 — Docker & CI

Multi-stage Dockerfile (deps → build → nginx runtime, non-root, SPA fallback, gzip,
healthcheck) and a dev-server stage with HMR. `docker-compose.yml` with `dev` and `prod`
services. `.dockerignore`. GitHub Actions: install → typecheck → lint → test → build →
docker build.

**Exit:** `docker compose up prod` serves the working app on a clean machine; CI green.

## Phase 10 — Documentation & submission

`README.md` covering all ten bullets the brief lists (overview, install, Docker, dev, build,
test, structure, architecture, decisions, assumptions & trade-offs) with screenshots.
`TECHNICAL_REVIEW.md` answering all seven questions substantively — assembled from
`docs/DECISIONS.md`, including the honest debt list and a concrete scaling answer
(server-side everything, virtualised rows, cursor pagination, caching and invalidation,
concurrency conflicts across simultaneous admins).
Then `/audit-brief`, fix what it finds, final `/verify`, clean up the commit history, and
push to a public repo.

**Exit:** every box in `REQUIREMENTS.md` ticked with evidence; repo URL ready to send.

---

## Sequencing rationale

Infrastructure before features (phases 1–4), then the three slices in ascending complexity
(5–7) so the shared engine is stress-tested by the simple case before the relational one
depends on it. Bonus work only after all mandatory requirements are green — a missing
required feature costs far more than a missing optional one. Docs last, but written from a
decision log kept throughout, so the review document reflects real reasoning rather than
after-the-fact narrative.

## Risks

| Risk | Mitigation |
|---|---|
| Table engine over-abstracted before its third consumer exists | Build it against Categories, refactor when Tickets reveals the real requirements |
| Three entity slices become copy-paste | The `crud-entity` skill fixes the shape; `/audit-brief` explicitly checks duplication |
| Bonus features eat time owed to tests | Phase 8 sits after all mandatory work; it's the cut line if time runs short |
| Docker left to the end and fails on a clean machine | Phase 9 builds from scratch with no local cache |
