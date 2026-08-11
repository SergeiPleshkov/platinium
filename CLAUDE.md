# Ticket Management Admin Portal

Vue 3 admin portal for managing Events, Ticket Categories and Tickets. Built as a technical
assessment, but written as if it were the foundation of a real production platform that
will keep evolving.

The graded artefact is the **codebase**, not just the running app. Architecture, testing
strategy and craftsmanship count as much as features.

## Non-negotiables

- **Never claim something is done that isn't verified.** Evidence is a file path, a passing
  test, or something observed in a browser — not an intention.
- Mandatory stack — Vue 3, Pinia, Vue Router, TypeScript, Docker. These are hard
  requirements from the brief; do not substitute.
- No `any`, no `@ts-expect-error`, no `eslint-disable` without a comment explaining why.
- Every change lands green: typecheck, lint, format, tests, production build — `/verify`.
- Reasoning lives next to the code it explains: a comment above the surprising line, or the
  README of the layer it describes. Say what the decision cost, not just what it was.

## Stack

| Concern | Choice |
|---|---|
| Framework | Vue 3 (`<script setup>`, Composition API only) |
| Build | Vite |
| Language | TypeScript, `strict: true` |
| State | Pinia (setup stores) |
| Routing | Vue Router 4, lazy-loaded route components |
| HTTP | axios, **only** inside `shared/api`; callers see our `ApiError` |
| Mock API | MSW — shared handlers for browser **and** tests |
| UI kit | PrimeVue 4 (Aura preset, custom tokens) — **always behind our own `shared/ui` wrappers** |
| Styling | Tailwind CSS for layout; PrimeVue design tokens for components |
| Forms | vee-validate + zod (schemas shared with the API layer) |
| Testing | Vitest, @vue/test-utils, @testing-library/vue, MSW |
| Quality | ESLint (flat config), Prettier, vue-tsc |
| Ship | Multi-stage Docker → nginx; docker compose for dev |

## Layout

```
src/
  app/            # bootstrap: app entry, router, pinia, global providers, styles
  shared/         # cross-feature, feature-agnostic
    api/          # http client, error normalisation, query serialisation — see its README.md
    ui/           # presentational primitives (Base*), zero domain knowledge
    composables/  # useListView, useTable, useCollectionState, useBulkAction, ...
    utils/        # pure functions, fully unit-tested
    types/        # shared/domain-agnostic types
  features/
    auth/         # each feature: components/ composables/ pages/ store.ts api.ts schema.ts types.ts
    events/
    categories/
    tickets/
    dashboard/
  mocks/          # MSW handlers, fixtures, seed data, browser + node setup
tests/            # integration tests + shared test utilities
```

Dependency rule, enforced by review and lint: `app → features → shared`. A feature never
imports from another feature's internals — cross-feature needs go through `shared/` or an
explicit public `index.ts` barrel.

**PrimeVue is a replaceable dependency, not the architecture.** It may only be imported
inside `src/shared/ui/**` and the app bootstrap. Everything else consumes our own `Base*`
components. This is enforced by an ESLint `no-restricted-imports` rule, not by good
intentions — the intent is that swapping PrimeVue for in-house components later is a change
to one directory, and the test suite (which asserts on roles and labels, never on PrimeVue
internals) should stay green through it.

## Conventions

- Components: `PascalCase.vue`. Shared primitives prefixed `Base` (`BaseButton`,
  `BaseDataTable`). Feature components carry the domain name (`EventFormDialog`).
- Composables: `useThing.ts`, return a plain object of refs/computed/functions.
- Stores: `useEventsStore` in `features/<x>/store.ts`, setup syntax, no `any` in state.
- Types: `interface` for object shapes, `type` for unions/aliases. Domain types live with
  their feature; only genuinely shared ones go in `shared/types`.
- Async: never swallow an error. Normalise it at the API boundary into `ApiError`, surface
  it through the store, render it via notifications or inline field errors.
- Keep components presentational where possible; business logic belongs in composables and
  stores so it can be tested without mounting.

## Commands

Keep this table accurate.

```bash
pnpm dev            # vite dev server + MSW worker
pnpm build          # type-check then production build
pnpm typecheck      # vue-tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write
pnpm test           # vitest run (unit + integration)
pnpm test:unit      # unit only
pnpm test:watch     # vitest watch
pnpm test:coverage  # coverage report
```

## Working agreement

Work enters through one of two doors and leaves through the same two gates.

```
new work ──▶ system-design ──▶ [design review] ──▶ approved ──▶ /feature ──┐
                                                                            ├─▶ code-review ─▶ /verify
bug report ─▶ bug-fix (repro ▸ root cause ▸ red-then-green) ────────────────┘
```

| Skill / command | Use it for |
|---|---|
| `system-design` | Anything touching more than one layer. Produces a plan, then a task list. Nothing is built before the plan is approved. |
| `/feature <what>` | Implementation. Plans, orients, builds, verifies, reviews, commits. |
| `bug-fix` | Anything broken. Reproduce first; the regression test is written before the fix. |
| `code-review` | Hard-facts audit of a diff. Findings cite a rule or a line, or they are not raised. |
| `/verify` | The quality gate. Run it before declaring anything complete. |
| `/audit-brief` | Checks the whole thing against the assessment brief. |
| `vue-feature` `crud-entity` `testing-vue` | The architecture, the entity-slice shape, and the testing strategy. |

- Audits run at most **two cycles**, then escalate to a person. Never a third.
- Heavy phases (codebase analysis, audits) run as subagents and hand off through `plans/`,
  which is git-ignored and deleted once the summary is acknowledged.
- **Search `src/shared/` before adding a composable or primitive.** Most of what a new screen
  needs already exists; the inventory is in the `vue-feature` skill. Extract on the third real
  consumer, not the second.
- Commit per meaningful unit of work with a conventional-commit subject. The commit history
  is part of what the reviewer reads — keep it clean and legible.
- When a review finding repeats, it belongs in a skill rather than in another review.
