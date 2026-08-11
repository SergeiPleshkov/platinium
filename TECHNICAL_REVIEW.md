# Technical Review

---

## 1. Main architectural decisions

### Vertical feature slices, boundaries enforced by the build

The app is organised by feature, not by technical role. `features/tickets/` holds types, schema,
endpoints, store, components and pages together. Dependency direction is `app → features → shared`,
enforced by ESLint:

- a feature imports another feature only through its public `index.ts`
- a feature never imports `app/`
- `shared/` never imports `features/` or `app/`
- `primevue/*` only in `shared/ui` and app bootstrap; `axios` only in `shared/api`; no bare `fetch`

The rules have their own tests. `tests/architecture/boundaries.spec.ts` writes deliberate
violations, lints them, and asserts each is rejected — and that sanctioned imports still pass —
so a rule tightened until everything is forbidden cannot look like a win.

### The store owns data; `useTable` owns the query

`useTable` holds search, filters, sort and page (URL-synced) and holds no rows. Rows live in the
feature Pinia store, so a page of server state exists in one place. That also gives Pinia real
work instead of a parallel cache.

`useCollectionState<T>()` supplies state and derived flags to all three entity stores.
`useEntityPage` owns create/edit dialog and delete-confirm flow on the list pages.
`useRelationOptionsLoader` owns abortable search + pin loads for relation pickers.

### PrimeVue behind an adapter

Feature code sees `Base*` components with our prop APIs. PrimeVue stays in one directory plus
bootstrap. Tests query by role, label and text, so the suite targets our contract and would
survive replacing the kit.

The kit may include hand-written primitives. `BaseSegmentedControl` is not a wrap of PrimeVue’s
`SelectButton`: that renders `aria-pressed` toggles (three independent buttons). A radio group
needs roving tabindex and arrow keys.

Storybook documents the kit: 18 components, 79 stories, `pnpm storybook`. It renders through the
app's own `installPrimeVue` and `main.css`, because a Storybook with its own copy of the theme
is a second source of truth and the first thing it does is disagree with the app. The stories
carry the states that are awkward to reach by clicking: a table mid-skeleton, a filtered list
with no matches, a delete refused by a 409, a bulk bar as an editor who cannot delete.

The scope is `shared/ui` and nothing else, and that boundary is the same one the architecture
already draws. Those components have no domain knowledge, so they render from props; a feature
component needs a store, a router and a mock backend, which is an integration test wearing a
different hat.

### One error type at the API boundary

Every failure leaves `shared/api` as `ApiError` — network drop, timeout, 422, 500, deliberate
abort — with `isValidation`, `isConflict`, `isRetryable`, `isAborted`. Stores ask
`error.isValidation`, not HTTP status codes. See [`src/shared/api/README.md`](src/shared/api/README.md).

`fetchList` never throws (a failed list is page state). Mutations always rethrow (the form must
decide whether to close).

### Querying is server-side

Search, filter, sort and paginate run in the handler, in that order, behind `{ data, meta }`.
`tests/mock-api/querying.spec.ts` checks disjoint pages, full walks without duplicates, and
global sort extremes. That is what makes the scaling answer in §5 credible.

Relation pickers follow the same model: debounced server search (`perPage` 20) with the selected
option pinned so an edit outside the first page does not blank the field.

### Permissions are capabilities, checked twice

One `ROLE_PERMISSIONS` matrix for UI and mock backend. The UI hides what the role cannot do; the
server re-checks the same matrix and returns 403. Forbidden calls are asserted in API tests
(status and unchanged data). 403 is not routed through the 401 hook — that would sign a viewer
out for clicking a disallowed control.

### Accessibility as correctness

Dashboard drag handles are focusable buttons; arrow keys call the same reorder function as drop.
One live region per announcement (nested spinners use `decorative`). Composite widgets use
`aria-labelledby`. Colour never carries meaning alone.

### One mock backend, two runtimes

MSW handlers run in a Service Worker for the browser and in Node for Vitest. One path, no second
stub set to drift.

---

## 2. What I would do with two more days

Every bonus on the brief’s list is implemented. Two more days would harden deployment and close
product gaps, not invent core CRUD.

**Day one**

1. **Widen bulk and CSV import** beyond tickets. The helpers are already generic; remaining work
   is wiring Events and Categories.
2. **Put Playwright + axe in CI.** `pnpm test:e2e` already covers login, one create per entity,
   and axe on main screens against a production preview. CI today runs Vitest and a Docker curl
   smoke. Add a keyboard-only pass over dialogs beside it.
3. **A bundle-size budget in CI.** Manual vendor chunking made first load worse than Vite’s
   route-aware splitting. Measure, then fail the build on regression.

**Day two**

4. **Pick a default view mode per screen** and drop or hide the DEMO pagination/virtual switch
   once there is usage data.
5. **Locale preference UI.** Formatters already read `getAppLocale()`; wire `setAppLocale` from
   bootstrap and clear remaining hard-coded `'en-GB'` call sites.
6. **An audit trail on events** (below) — the one net-new feature I would argue for hardest.

### Audit trail (shape)

Events carry money and inventory. Edits today overwrite with no history.

- Mutating handlers append: entity type/id, actor, timestamp, field-level before/after. Hook at
  `parseBody` / permission preamble once, not in every handler.
- `GET /api/events/:id/history` returns `{ data, meta }` so `useTable` / `BaseDataTable` work
  unchanged.
- UI: a drawer with readable sentences (“Ada Okonjo changed Venue from … to …”), not raw JSON.
  Diffing is a pure function.
- Append-only; no delete endpoint.

**Visibility: `admin` only**, via a new `audit` capability in `ROLE_PERMISSIONS`. The log names
staff and timestamps activity — personal data, not a tool for promoters with viewer access.
Live “someone else is editing” is a different problem; that belongs to optimistic concurrency
(§5), not a permanent staff activity log.

---

## 3. Technical debt I intentionally accepted

**MSW in the production bundle**, lazy-imported behind `VITE_ENABLE_MOCK_API`. This app has no
other backend for the assessment. A real deploy sets the flag to `false` and the chunk never
loads.

**Playwright outside the CI gate.** The suite exists; the pipeline still stops at Vitest + Docker
curl. The journeys are covered; automation of the browser gate is not.

**`pageValueByCurrency` is page-scoped**, labelled as such. Dashboard `/api/stats` holds the
real totals. Keeping a convenient page sum avoids a second aggregation for a column that already
has the data.

**Locale seam without a preference UI.** Defaults are `en-GB`. A few sites still format with a
literal locale string.

**Storage-blocked browsers degrade quietly.** If `localStorage` throws (Safari private mode),
session and theme work for the tab but do not persist. Handled, not announced.

**Last-write-wins on concurrent edits.** No `ETag` / `If-Match` yet (see §5).

---

## 4. What I would refactor first

1. **Locale end-to-end.** Persist a preference, call `setAppLocale` at bootstrap, replace
   remaining hard-coded `'en-GB'` (dashboard number format, quantity columns).

2. **Delete the `zodSchema` adapter** when vee-validate supports Standard Schema. It exists
   only because `@vee-validate/zod` targets zod 3 internals. Zod itself stays — one schema for
   form, mock handler and inferred types.

3. **Playwright in CI**, with a clear split: Vitest for logic, Playwright for browser/axe,
   Docker curl for nginx SPA smoke — or run Playwright against the image if that is simpler to
   operate.

---

## 5. Scaling to hundreds of thousands of tickets and many concurrent administrators

### Reading data

Nothing is counted or filtered in the browser. Search, filter, sort and pagination are
server-side; `perPage` is capped; dashboard figures come from `/api/stats`. Those are the
expensive decisions, and they are already made.

At ~250k rows:

- **Replace offset pagination with keyset (cursor)** ordered by `(sort_key, id)`. Client change
  is contained in `useTable` and `{ data, meta }`.
- **Approximate or drop exact totals** — `COUNT(*)` over large filtered sets is expensive;
  keyset naturally offers next/previous.
- **Default to row virtualisation** (already implemented; switch policy, not build it).
- **Indexes on every sortable column.**

### Aggregation

`/api/stats` stays the contract. At scale it reads a materialised view or rollup table. The
client does not change.

### Concurrent administrators

Today: last write wins. Fix with optimistic concurrency — `version` / `ETag`, `If-Match` on
mutations, 409 on mismatch. `ApiError.isConflict` already exists for referential integrity;
surfacing “reload and reapply” is a form message. Optionally SSE/WebSockets to invalidate open
lists. Per-entity locks only if measured contention warrants them.

### Client performance

Routes are lazy-loaded; superseded requests abort. Next step: a Pinia-native server-state cache
(Pinia Colada) behind `useCollectionState` for dedupe and background revalidation — without a
second state library beside the mandated Pinia. Add when refetch pressure is measured, not
before.

---

## 6. Coding standards and quality checks I would introduce

Most of this is already in the repo.

**Automated and blocking**

- TypeScript: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- Architectural boundaries as lint rules, with tests over the rules
- One gate locally and in CI: typecheck → lint → format → test → build (`pnpm verify`). Never
  weaken it to go green
- CI smokes the running container (health, root, deep link), not only the image build
- Add: Playwright + axe in CI, and a bundle-size budget that fails on regression
- Add: the Storybook a11y addon is wired but only advisory. Running it under the Storybook
  test runner in CI would make an axe regression in a primitive fail the build, which is
  where it is cheapest to catch

**Conventions (review)**

- Query tests by role, label and text; `data-testid` only when no accessible handle exists
- MSW is the only mock; many mocks usually means fix the design
- Break new tests on purpose once before trusting them
- Reasoning next to the surprising line, or in the layer README
- A new `shared/ui` primitive ships with its stories. The variants and states are the API,
  and a story is the cheapest place to see all of them at once
- Conventional commits that explain why

**Process**

- Small PRs against a written plan
- Audits that look for what is missing, not what is impressive

---

## 7. How AI fits into daily development on this project

The point is not “faster typing”. The workflow lives in the repository — under
[`.claude/`](.claude/) — so every agent session follows the same architecture and the same
gates.

### Two entry points, shared gates

```
new work ──▶ system-design ──▶ [design review] ──▶ approve ──▶ implement ──┐
                                                                            ├──▶ code-review ──▶ /verify
bug report ─▶ bug-fix (repro ▸ root cause ▸ red-then-green) ───────────────┘
```

### Skills

| Skill | Role |
|---|---|
| `system-design` | Layered plan + task list before any code |
| `code-review` | Diff audit; findings cite a rule or line and a mechanical fix |
| `bug-fix` | Repro, failing test, then fix |
| `vue-feature` | Boundaries, placement, composable inventory, a11y |
| `crud-entity` | Nine layers of an entity slice, in order |
| `testing-vue` | What each test kind is for, and suite traps |

Commands: `/verify` (gate), `/feature` (end-to-end change), `/audit-brief` (brief coverage).

### Principles

- **Architecture as executable rules**, not prose — lint rejects bad imports in seconds; boundary
  tests keep the rules honest.
- **Plan in the repo before code** — cheap to reject a plan, expensive to reject a branch.
- **Cap review loops at two cycles**, then a human — agents otherwise satisfy the audit instead
  of the product.
- **Heavy work in subagents** with file handoff so the parent context stays coherent.
- **Extract on the third real consumer**, not on taste.
- **Verify in the browser and the container**, not only in Vitest.

### Highest-leverage next uses

- Scaffolding a fourth entity via `crud-entity`
- Locale preference + CI Playwright (well-specified, suite-backed)
- A future PrimeVue exit: one directory + role/label tests as the success criterion
- Folding repeated review findings into skills so the workflow sharpens with use
