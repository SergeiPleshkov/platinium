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
- [ ] Simple login page
- [ ] Authentication fully mocked
- [ ] Authenticated users reach the administration portal (unauthenticated ones cannot)

### Dashboard
- [ ] Manage Events
- [ ] Manage Categories
- [ ] Manage Tickets
- [ ] Search
- [ ] Filtering
- [ ] Sorting
- [ ] Pagination

### CRUD — complete Create / Read / Update / Delete for all three entities
- [ ] Ticket — Name, Price, Currency, Quantity, Status, Event, Category
- [ ] Event — Name, Country, Venue, Start Date, End Date, Status
- [ ] Category — Name, Description

### Validation & error handling
- [ ] Form validation
- [ ] User-friendly validation messages
- [ ] Proper loading states
- [ ] Graceful API error handling
- [ ] Success / error notifications

### Responsive
- [ ] Desktop
- [ ] Mobile
- [ ] Tablet

## Technical

### Mandatory stack
- [x] Vue 3 — `src/app/main.ts`, `<script setup>` enforced by `vue/component-api-style`
- [x] Pinia **or** Vuex — Pinia registered in `src/app/main.ts`; stores land with the slices
- [x] Vue Router — `src/app/router/`, lazy-loaded routes
- [x] TypeScript — `tsconfig.base.json`, strict + `exactOptionalPropertyTypes`
- [ ] Docker

### Mock API
- [x] Data fixtures simulating backend data — `src/mocks/fixtures/`, deterministic:
      10 categories, 30 events, 250 tickets with real relations
- [x] MSW / MirageJS / json-server / equivalent — MSW, one handler set shared by the browser
      worker and the Vitest node server (`src/mocks/README.md`)

### Architecture — must demonstrate
- [x] Scalable folder organization — `src/features/README.md`; layering enforced by
      `eslint.config.js` and proven by `tests/architecture/boundaries.spec.ts`
- [ ] Reusable components — `shared/ui` layer started (`BaseButton`), built out in phase 3
- [ ] Separation of concerns
- [ ] Reusable composables
- [ ] Clean state management
- [ ] Reusable API layer
- [ ] Maintainable project structure

### Testing
- [ ] Unit tests — components, stores, composables, utilities
- [ ] Integration tests — complete user interactions and business flows

## Deliverables

- [ ] Fully functional Vue 3 application
- [ ] Docker configuration
- [ ] Mock API implementation
- [ ] Unit tests
- [ ] Integration tests
- [ ] `README.md` — project overview, installation, Docker setup, development commands,
      build commands, testing commands, project structure, architecture overview,
      technical decisions, assumptions and trade-offs
- [ ] `TECHNICAL_REVIEW.md` — main architectural decisions; what you'd improve with two
      more days; technical debt intentionally accepted; what you'd refactor first; how
      you'd scale to hundreds of thousands of tickets and many concurrent admins; coding
      standards and quality checks you'd introduce for the team; how AI fits your daily
      development workflow on this project
- [ ] Pushed to a public Git repository, URL shared

## Bonus (optional, "if time permits")

Brief's list: Dark mode · Bulk actions · CSV import/export · Dashboard statistics ·
Role-based permissions · Optimistic UI updates · Drag & drop ordering · Infinite scrolling ·
anything else that demonstrates engineering skill.

Selected for this submission (phase 8, in build order — all after mandatory work is green):

- [ ] Dark mode
- [ ] Dashboard statistics (aggregated server-side)
- [ ] Bulk actions (multi-select delete / status change, partial-failure reporting)
- [ ] CSV export (of the current filtered query, not just the visible page)
- [ ] CSV import (per-row validation, preview, error report)
- [ ] Optimistic UI updates (with rollback)
- [ ] Role-based permissions (enforced in UI *and* at the mock API boundary)

Not selected: drag & drop ordering, infinite scrolling — both conflict with the mandated
sortable, paginated table, and neither adds signal the above don't already provide.
