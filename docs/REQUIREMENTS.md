# Requirements traceability

Verbatim requirement inventory extracted from `Technical test - Senior Frontend Developer.pdf`
(SHA-256 `0ec7e1df2eb0df20a98416a9035bd3c6c7c0cd1a28ed68f3cec1c6bc241100ee`, 6 pages,
Google Docs export, audited — no active content).

This file is the single source of truth for "is the task done". Every box must be ticked
before submission. Do not silently reinterpret a requirement — if a decision deviates,
record it in `TECHNICAL_REVIEW.md` under accepted trade-offs.

## Context

> Build a Ticket Management Admin Portal allowing administrators to manage Events, Ticket
> Categories and Tickets. Designed with scalability, maintainability, performance and
> developer experience in mind. Assume this application is the foundation of a real
> production admin platform that will continue to evolve over time.

Graded on: frontend architecture, engineering practices, testing strategy, technical
decision-making, overall software craftsmanship — not only "does it work".

## Functional

### Authentication
- [x] Simple login page — `src/features/auth/pages/LoginPage.vue`
- [x] Authentication fully mocked — tokens issued, checked and invalidated by MSW
- [x] Authenticated users reach the administration portal (unauthenticated ones cannot) —
      guards in `src/app/router/guards.ts`, covered by `tests/integration/auth-flow.spec.ts`

### Dashboard
- [x] Manage Events
- [x] Manage Categories
- [x] Manage Tickets
- [x] Search — debounced, server-side, URL-synced
- [x] Filtering — status and country on events; all server-side
- [x] Sorting — every sortable column, across the whole collection
- [x] Pagination — server-side, page size configurable, clamped by the server

### CRUD — complete Create / Read / Update / Delete for all three entities
- [x] Ticket — Name, Price, Currency, Quantity, Status, Event, Category
- [x] Event — Name, Country, Venue, Start Date, End Date, Status
- [x] Category — Name, Description

### Validation & error handling
- [x] Form validation — one zod schema per entity, shared by form and mock API
- [x] User-friendly validation messages — say what to do; server 422s map onto their fields
- [x] Proper loading states — skeletons before first load, never a spinner over an empty grid
- [x] Graceful API error handling — error state with retry; conflicts explained in the dialog
- [x] Success / error notifications — `useNotifications` queue rendered by `BaseToaster`

### Responsive
- [x] Desktop (1280) — sidebar, full grid; verified in a browser
- [x] Tablet (768) — grid retained, nav becomes a drawer, no horizontal scroll; verified
- [x] Mobile (375) — table becomes a card list, off-canvas drawer; verified, and the card
      branch is covered by `BaseDataTable.spec.ts`

## Technical

### Mandatory stack
- [x] Vue 3 — `src/app/main.ts`, `<script setup>` enforced by `vue/component-api-style`
- [x] Pinia **or** Vuex — Pinia registered in `src/app/main.ts`; stores land with the slices
- [x] Vue Router — `src/app/router/`, lazy-loaded routes
- [x] TypeScript — `tsconfig.base.json`, strict + `exactOptionalPropertyTypes`
- [x] Docker — multi-stage build, non-root nginx runtime, verified running

### Mock API
- [x] Data fixtures simulating backend data — `src/mocks/fixtures/`, deterministic:
      10 categories, 30 events, 250 tickets with real relations
- [x] MSW / MirageJS / json-server / equivalent — MSW, one handler set shared by the browser
      worker and the Vitest node server (`src/mocks/README.md`)

### Architecture — must demonstrate
- [x] Scalable folder organization — `src/features/README.md`; layering enforced by
      `eslint.config.js` and proven by `tests/architecture/boundaries.spec.ts`
- [x] Reusable components — 12 `shared/ui` adapters, all PrimeVue-free at the call site
- [x] Separation of concerns — components render, composables hold behaviour, stores hold
      state, `shared/api` owns transport; all four enforced by lint
- [x] Reusable composables — `useAsyncAction`, `useNotifications`, `useBreakpoint`
- [x] Clean state management — Pinia stores own server state; `useCollectionState` shares
      state+getters across entities; `useTable` owns query state only, so no data lives twice
- [x] Reusable API layer — `shared/api`: axios behind our `ApiError` contract, with token
      injection, timeouts, cancellation and one central 401 hook; `serialiseListQuery` shared
      by every list call
- [x] Maintainable project structure — three slices on one shape; the third cost a fraction
      of the first

### Testing
- [x] Unit tests — components, stores, composables, utilities, schemas, architecture
- [x] Integration tests — auth, categories, events and tickets journeys through the router

## Deliverables

- [x] Fully functional Vue 3 application — all three entities, verified in a browser and
      in the Docker image
- [x] Docker — multi-stage build, non-root nginx runtime, verified running configuration
- [x] Mock API implementation — MSW, `src/mocks/`, 51 endpoint tests
- [x] Unit tests — utilities, schemas, composables, stores, components, architecture
- [x] Integration tests — 4 journeys through the real router and mock backend
- [x] `README.md` — all ten bullets covered
- [x] `TECHNICAL_REVIEW.md` — all seven questions answered
- [ ] Pushed to a public Git repository, URL shared

## Bonus (optional, "if time permits")

Brief's list: Dark mode · Bulk actions · CSV import/export · Dashboard statistics ·
Role-based permissions · Optimistic UI updates · Drag & drop ordering · Infinite scrolling ·
anything else that demonstrates engineering skill.

Selected for this submission (phase 8, in build order — all after mandatory work is green):

- [x] Dark mode — light/dark/system, persisted, pre-paint so a reload never flashes
- [x] Dashboard statistics — aggregated server-side via `/api/stats`; the browser never
      loads a collection to count it
- [ ] Bulk actions (multi-select delete / status change, partial-failure reporting)
- [x] CSV export — of the current filtered query, server-rendered; 27 tests
- [ ] CSV import (per-row validation, preview, error report)
- [ ] Optimistic UI updates (with rollback)
- [ ] Role-based permissions (enforced in UI *and* at the mock API boundary)

Not selected: drag & drop ordering, infinite scrolling — both conflict with the mandated
sortable, paginated table, and neither adds signal the above don't already provide.
