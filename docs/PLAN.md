# Implementation plan

Ticket Management Admin Portal — Senior Frontend Developer technical assessment.

Requirements inventory: [REQUIREMENTS.md](REQUIREMENTS.md). Conventions: [../CLAUDE.md](../CLAUDE.md).
Every phase ends with `/verify` green and a commit.

---

## Phase 0 — Foundation ✅ (done)

Git repo, `CLAUDE.md`, requirements traceability, skills (`crud-entity`, `vue-feature`,
`testing-vue`), workflows (`/verify`, `/phase`, `/audit-brief`), decision log, `.gitignore`.

---

## Phase 1 — Project skeleton & toolchain ✅ (done)

Scaffold Vite + Vue 3 + TS (`strict`, `noUncheckedIndexedAccess`), path alias `@ → src`.
PrimeVue 4 with a custom Aura preset (our own colour/spacing tokens, `darkModeSelector: '.dark'`)
+ Tailwind for layout. ESLint 9 flat config (`vue`, `@typescript-eslint`, `vue-a11y`) with
two hard boundary rules: no cross-feature imports, and **`primevue/*` importable only from
`src/shared/ui/**`**. Prettier. Vitest with jsdom, coverage, Testing Library setup. The
folder tree from `CLAUDE.md`, real not empty. `package.json` scripts matching the command table.

**Exit:** `pnpm dev` serves a shell page; the boundary lint rules provably fail on a
deliberate violation; typecheck, lint, an empty test run and build all pass.

## Phase 2 — Mock API & domain model ✅ (done)

Domain types and zod schemas for Event, Category, Ticket, User. Deterministic fixtures —
~30 events, ~10 categories, ~250 tickets with real relations. In-memory MSW database with
CRUD + reset. Handlers implementing **server-side** search → filter → sort → paginate over
the shared `{ data, meta }` envelope, plus artificial latency, 422 validation errors, and a
switch to force 500s so error paths are demonstrable. One handler set, wired for both the
browser worker and the Vitest node server.

**Exit:** every endpoint exercised by a store-level test; pagination/sort/filter proven
server-side, not client-side.

## Phase 3 — App shell, API layer, auth ✅ (done)

`shared/api`: `http.ts` (axios instance, interceptors for auth and 401), `errors.ts`
(`ApiError` normalisation). No generic CRUD factory — measured, it cost more than it saved;
stores call `http` directly. See docs/DECISIONS.md.
`shared/ui` adapter layer over PrimeVue: Button, Input, Select, Textarea, DatePicker, Modal,
Badge, Skeleton, EmptyState, ConfirmDialog, FileUpload, Toast host — each with our own prop
API, so features never see PrimeVue. Core composables: `useAsyncAction`, `useNotifications`,
`useBreakpoint`.

Carried over from phase 1, **corrected**: Aura's muted text measures 4.76:1 on white and
4.55:1 on our background — it passes WCAG AA. The phase 1 claim of ≈4.0:1 was an eyeball
estimate. Muted text still moves to `surface.600` (7.24:1) for margin, and real computed
contrast assertions now cover every text pairing in both schemes.
Auth feature: login page with validation, mocked credentials, session in a Pinia store
persisted to `localStorage`, route guards, 401 interception, logout.
Portal layout: responsive sidebar (off-canvas below `lg`), topbar, user menu, router views.

**Exit:** protected routes redirect; login → dashboard → reload keeps session → logout
returns to login; all covered by an integration test.

## Phase 4 — Data table engine ✅ (done)

The piece the three entity slices are built on, so it's built once and built well.
`useTable` composable — debounced search, typed filters, multi-column sort, pagination, all
two-way synced with the URL query so any view is shareable and reload-safe, with superseded
requests aborted. **`useTable` is ours and knows nothing about PrimeVue**; it is the part
that survives a UI-kit swap intact.
`BaseDataTable` wraps PrimeVue `DataTable` in lazy mode (server-driven paging/sorting/
filtering), exposing our own typed column definitions, row actions, selection (groundwork
for bulk actions), loading skeleton, empty state, no-results-for-filters state, error state
with retry, and a stacked card layout below `md`.

**Exit:** unit tests for `useTable` (debounce, URL round-trip, abort) and component tests
for every table state, written against roles and text so they survive the wrapper's
internals changing.

## Phase 5 — Categories slice ✅ (done)

Simplest entity first — it proves the vertical-slice pattern end to end and shakes out the
table engine. Nine layers per the `crud-entity` skill: types, schema, fixtures, handlers,
API resource, store, list page, form dialog, tests (schema, store, form, integration flow).

**Exit:** full CRUD through the UI; create → edit → delete integration flow green.

## Phase 6 — Events slice ✅ (done)

Same nine layers, plus: date-range fields with cross-field validation (end after start),
country and status filters, status badges, and a guard on deleting an event that still has
tickets (with a clear explanatory error).

**Exit:** CRUD + filtering + sorting + pagination green; date validation covered.

## Phase 7 — Tickets slice ✅ (done)

The relational one. Adds: event and category relations rendered as names (not ids), price +
currency with correct formatting, quantity, status, filtering by event / category / status /
price range, and searchable relation selects in the form. This slice is why pagination and
server-side querying had to be real — it carries ~250 rows.

**Exit:** CRUD + all filters + relation integrity green; the full integration flow passes.

## Phase 8 — Dashboard & bonus features

All six bonus tracks are in scope, built in this order (each is independently shippable, so
if time runs out the cut is clean):

1. **Dark mode** — `darkModeSelector` is wired in phase 1, so this is a token pass, a
   toggle, `prefers-color-scheme` as the default, and persistence.
2. **Dashboard statistics** — KPI tiles (events, tickets, inventory value, sold-out count),
   tickets per event, upcoming events, recent activity. Aggregated **server-side in MSW**
   via a dedicated `/api/stats` endpoint — never by pulling every row to the client, which
   is the whole point of the scaling question in the review doc.
3. **Bulk actions** — multi-select delete and status change, with a batch endpoint,
   partial-failure reporting, and a confirm step showing the affected count.
4. **CSV export** — exports the *current filtered query*, not just the visible page;
   streamed from a server-side endpoint so it stays correct at 250k rows.
5. **CSV import** — file upload → parse → per-row zod validation → preview table showing
   valid and rejected rows with reasons → commit only the valid ones → downloadable error
   report. Rejects malformed files and oversized uploads with a clear message. This is the
   most failure-prone bonus, so it gets the most test attention.
6. **Optimistic updates + RBAC** — optimistic create/update/delete with rollback on failure
   and a toast explaining the revert; `admin` / `editor` / `viewer` roles gating actions in
   the UI *and* re-checked at the mock API boundary, so it isn't security theatre.

**Exit:** each shipped bonus has tests (import gets happy path, partial-reject, and
malformed-file cases); none of them destabilise the core flows.

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
| PrimeVue leaks into features, making the planned swap expensive | ESLint `no-restricted-imports` blocks `primevue/*` outside `shared/ui`; tests query by role/label, never PrimeVue internals |
| Wrapping PrimeVue turns into a thin pointless re-export | Wrappers own their prop API and their states; a wrapper that just spreads `$attrs` into a Prime component is a review finding |
| Six bonus tracks eat time owed to mandatory work | Phase 8 sits entirely after phases 1–7; tracks are ordered cheapest-and-most-visible first and each is independently cuttable |
| Docker left to the end and fails on a clean machine | Phase 9 builds from scratch with no local cache |
