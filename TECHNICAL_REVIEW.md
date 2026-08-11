# Technical Review

---

## 1. Main architectural decisions

### Vertical feature slices, with boundaries the build enforces

The app is organised by feature, not by technical role. `features/tickets/` holds its types,
schema, endpoints, store, components and pages together. The dependency direction is
`app → features → shared`, and ESLint enforces it:

- a feature cannot import another feature's internals, only its public `index.ts`
- a feature cannot import `app/`
- `shared/` cannot import `features/` or `app/`
- `primevue/*` only inside `shared/ui`, `axios` only inside `shared/api`, `fetch` nowhere else

The part I would defend hardest is that the rules have their own tests.
`tests/architecture/boundaries.spec.ts` writes deliberate violations to disk, lints them, and
asserts each one is rejected. It also asserts that sanctioned dependencies still pass, so a rule
that has been tightened until everything is forbidden cannot pass as a win.

That test exists because of a near-miss. The first version of the config was silently broken:
flat config replaces a rule's options when a later entry configures the same rule, it does not
merge them, so the per-feature `no-restricted-imports` block had quietly switched off the
PrimeVue boundary for all feature code. `pnpm lint` was green throughout. Nothing short of an
executable check would have caught it. The configs are now mutually disjoint, which removes the
hazard instead of patching one instance of it.

### The store owns data; `useTable` owns the query

`useTable` holds search, filters, sort and page, synced to the URL. It holds no rows. Those live
in the feature's Pinia store, so a page of server state exists in one place and there is nothing
to keep in sync. It also gives the mandated Pinia layer real work instead of a parallel cache.

`useCollectionState<T>()` supplies state and derived flags to all three entity stores, so that
layer is written once instead of copy-pasted three times.

### PrimeVue behind an adapter layer

Feature code sees `Base*` components with our own prop APIs. PrimeVue is confined to one
directory plus the app bootstrap. Tests query by role, label and visible text, so the suite is
written against our contract and would survive replacing the kit.

The boundary has paid for itself twice. It rejected a direct PrimeVue import in a new dashboard
component. It also exposed that `BaseButton` was leaking PrimeVue's internal semantics: PrimeVue
decides icon-only styling from `hasIcon && !label` and never looks at slot content, so an `icon`
plus slot text rendered a small button with the label clipped mid-word.

The kit is also allowed to contain hand-written primitives, which is the point of it being ours.
`BaseSegmentedControl` does not wrap PrimeVue's `SelectButton`, because that renders
`aria-pressed` toggles, and those announce as three independent buttons instead of one choice of
three. A radio group needs roving tabindex and arrow keys. Writing the correct semantics beat
fighting the wrapped component.

### One error type at the API boundary

Every failure leaves `shared/api` as a single `ApiError`: dropped connection, timeout, 422, 500,
and requests we superseded on purpose. It carries `isValidation`, `isConflict`, `isRetryable`
and `isAborted`, which are application vocabulary rather than HTTP trivia. A store asks
`if (error.isValidation)`, so the day a backend starts returning 400 for validation, the answer
changes in one place. [`src/shared/api/README.md`](src/shared/api/README.md) documents the layer.

Two rules keep it consistent across stores. `fetchList` never throws, because a failed list is a
state the page renders, not an exception every caller has to remember to catch. Mutations always
rethrow, because the caller is a form that has to decide whether to close.

### Querying is server-side

Search, filter, sort and paginate all run in the handler, in that order, behind one
`{ data, meta }` envelope. `tests/mock-api/querying.spec.ts` checks it: pages are disjoint,
walking every page returns the seeded set with no duplicates, and sorting picks the global
extreme instead of the current page's. This is the decision that makes the scaling answer in §5
credible.

### Permissions are capabilities, and they are checked twice

One `ROLE_PERMISSIONS` matrix, imported by the UI and by the mock backend. A button asking
`can('delete')` keeps working when a fourth role appears. One asking `role === 'admin'` has to
be found and edited, and the ones nobody finds are the bugs.

Hiding a delete button stops an honest mistake and nothing else. The request still succeeds from
a console, or from a stale tab whose role was downgraded since it loaded. The server re-checks
against the same import, and the API tests make each forbidden call anyway, asserting both the
403 and that the data did not change.

403 is deliberately not routed through the 401 hook. Conflating them would sign a viewer out of
the application for clicking something they were not allowed to click.

### Accessibility as a correctness property

Several decisions here went against the simpler implementation, and the tests are written so
that undoing them goes red.

HTML5 drag and drop has no keyboard equivalent at all, so the drag handle is a focusable button
that carries its own position, and the arrow keys call the same reorder function the drop calls.
It is the same feature reached a different way, not a fallback beside the real one.

There is one live region per announcement. A live region is an element a screen reader reads
aloud whenever its content changes, so a spinner that is one, nested inside a container that is
also one, announces the same wait twice. That is invisible in a screenshot and obvious to a
screen reader.

Composite widgets are labelled by `aria-labelledby`, because PrimeVue's `Select` renders a
`<div>` root and a `<label for>` would associate with nothing. Colour never carries meaning on
its own.

### One mock backend, two runtimes

MSW handlers run in a Service Worker for the browser and in Node for Vitest, so tests exercise
the same request path the application does. There is no second set of stubs to drift.

---

## 2. What I would do with two more days

Every bonus on the brief's list shipped, so this is not a list of missing features. It is the
work that would make me comfortable putting this in front of real administrators.

**Day one: close the correctness gap, and the duplication I can name.**

1. **Server-backed relation pickers.** The one piece of debt that produces a wrong answer rather
   than a slow one (see §3). Half a day including tests.
2. **A `useEntityPage` composable.** The three list pages are large, and a good third of each is
   now identical: dialog open/close state, the delete confirmation with its in-dialog 409
   message, and the refresh-and-adopt-page dance after a mutation. Three real consumers exist,
   which is the bar the rest of the codebase was held to. `useListView`, `useBulkAction` and
   `BaseBulkFailures` were all extracted on that same trigger, and this is next in line.
3. **Widen bulk and import beyond where they were demonstrated.** Import is tickets-only, and
   the `handleBulk` and `useBulkAction` pair is already generic enough that what remains is
   wiring, not design.

**Day two: what a real deployment needs.**

4. **Playwright smoke tests** against the Docker image: login, one CRUD round trip per entity,
   one deep link. jsdom cannot catch a CSS regression, a focus trap that does not trap, or a
   Service Worker that fails to register. Several defects in this build were found by looking at
   a browser, not by the suite.
5. **A bundle-size budget in CI.** I tried hand-grouping the vendor chunks and reverted it: it
   pulls every route's PrimeVue components in eagerly and made the dashboard's first load
   noticeably worse than the bundler's own route-aware splitting. Measuring and then deciding is
   the right shape of answer, but it should be a gate that fails the build on regression, not
   something someone remembers to check.
6. **Real accessibility auditing:** axe in CI, plus a keyboard-only pass over every dialog.
   Accessibility was treated as a correctness property throughout (§1) and defects still reached
   the browser during this build. They were caught by tests that query the way a screen reader
   does, but I would not claim that is sufficient coverage.
7. **Decide what the view-mode switch is.** It ships labelled "DEMO" because shipping both
   rendering strategies is a demonstration, not a product decision. A real portal picks one per
   screen, and that choice needs data I do not have.
8. **An audit trail on events.** See below; this is the one item here that is a feature rather
   than a hardening task, and the one I would argue hardest for.

### The audit trail, in more detail

Events carry money and inventory. Once more than one person can edit them, "who moved this
event to a different venue, and when" stops being a nice-to-have. Today a change overwrites its
predecessor and leaves nothing behind, so a disputed price or a cancelled event has no history
to appeal to.

The shape:

- Every mutating handler writes an entry: entity type and id, the actor's user id, a timestamp,
  and a field-level diff of before and after. The mock backend already funnels every mutation
  through `parseBody` and the permission preamble, so there is one place to hook it rather than
  a change in every handler.
- `GET /api/events/:id/history` returns the entries newest first, paginated through the same
  `{ data, meta }` envelope every other list uses, which means `useTable` and `BaseDataTable`
  work unchanged.
- The UI is a drawer on the event row, rendering "Ada Okonjo changed Venue from Accor Arena to
  Ziggo Dome" rather than a raw JSON patch. Diffing is a pure function, so it is unit-testable
  without mounting anything.
- Entries are append-only and have no delete endpoint. A log that can be edited by the people
  it logs is not evidence.

**Who sees it: administrators only.** The history names staff and timestamps their activity,
which makes it personal data about employees and, in the wrong hands, a performance-monitoring
tool nobody agreed to. Viewers may be external stakeholders such as promoters with read access,
and there is no version of "which of your colleagues changed this price at 14:02" that they
need.

Editors are the interesting case, because they have a real problem the log looks like it would
solve: knowing that a colleague just changed the record they are editing. That is a different
requirement, though. It is about *right now*, not about history, and it is already answered by
the optimistic-concurrency design in §5, where a stale `If-Match` returns a 409 and the form
says so. Solving a live-coordination problem by exposing a permanent audit log is the wrong
tool, and it leaks more than it fixes.

So: a new `audit` capability in `ROLE_PERMISSIONS`, granted to `admin` alone. A capability
rather than a role check, for the same reason as everything else in that matrix, and it leaves
room for a future compliance role that can read the log without being able to change anything.

---

## 3. Technical debt I accepted deliberately

**The relation pickers cap their option list.** Creating a ticket means choosing an Event and
a Category from dropdowns. `fetchOptions()` fills those by asking for a single page of
`{id, name}` pairs sorted by name, and `BaseSelect`'s `filterable` then narrows the list in the
browser as the user types. The request asks for 200 and the server caps `perPage` at 100, so
100 is the real ceiling. The seeded data fits inside it.

At 500 events it stops being a performance question and becomes a correctness one. The picker
would hold the first 100 names alphabetically, so typing "Winter Gala" when that event sorts
340th would return "no results", which is indistinguishable from the event not existing. Nothing
errors and nothing logs; the user is simply told something false. That is why this is the first
thing I would fix rather than the cheapest.

The remedy is localised. Make the filter server-backed, so each keystroke queries
`GET /api/events?search=…&perPage=20`, and pin the currently selected option into the list so
that editing a ticket whose event falls outside the result page does not silently blank the
field.

**MSW ships in the production bundle,** lazy-imported behind an env flag. This application has
no other backend and the brief asks for a demonstrable one. A real deployment sets
`VITE_ENABLE_MOCK_API=false` and the chunk never loads.

**Three list pages share a shape but not code.** Near-identical dialog and delete handling
across Categories, Events and Tickets. I left it because the third slice is where the real
commonality became visible, and extracting on the second would have locked in the wrong seams.
It is ready to extract now; see §4.

**No E2E layer.** Integration tests drive the real router, stores and mock backend, but in
jsdom. Real layout, real focus management and real Service Worker registration are all untested.

**`pageValueByCurrency` sums only the loaded page.** It is correct and labelled as such, but a
user could reasonably read it as a total. The dashboard carries the real server-aggregated
figure; this one exists because the page already has the data.

**Storage-blocked browsers degrade quietly.** If `localStorage` throws, as it does in Safari
private mode, the session and theme still work for that tab but do not persist. Handled, but not
surfaced to the user.

---

## 4. What I would refactor first

**1. Extract `useEntityPage`.** The highest-value refactor, and the one with three proven
consumers. It would own dialog open/close state, the delete-confirmation lifecycle, and the
refresh-then-adopt-page dance after a mutation. One place to fix a bug in that flow instead of
three.

**2. Split `BaseDataTable`.** It is the largest component in the codebase and carries two
responsibilities: the desktop grid and the mobile card list. They share only props. Two
components behind one entry point would each be simpler than the current branch.

**3. Make the money and date utilities locale-aware.** Both hard-code European and US
conventions. An admin portal used across the countries in the seed data should take the locale
from the user, not from a constant. The seam already exists, since `formatMoney` and
`formatDate` are the only formatting points.

**4. Delete the `zodSchema` adapter when vee-validate allows it.** It exists only because
`@vee-validate/zod` targets zod 3 and reads internals that changed shape in zod 4. Once
vee-validate ships Standard Schema support the adapter can go. That is a calendar reminder, not
a rewrite. Zod itself stays either way: the schema is the validation contract for the form, for
the server handler and for the inferred payload types, and vee-validate's rule objects can only
serve the first of the three.

---

## 5. Scaling to hundreds of thousands of tickets and many concurrent administrators

### Reading data

The foundation is right already: nothing is ever counted or filtered in the browser. Search,
filter, sort and pagination run server-side, `perPage` is capped, and the dashboard's figures
come from a dedicated aggregation endpoint instead of a collection the client reduces. Those are
the decisions that are expensive to retrofit, and they are made.

What changes at a quarter of a million rows:

- **Offset pagination becomes the bottleneck.** A deep `OFFSET` makes the database walk rows it
  will discard. Move to keyset (cursor) pagination ordered by `(sort_key, id)`. The client
  contract changes from `page` to `cursor`, which is contained inside `useTable` and the
  `{ data, meta }` envelope: one composable and one type.
- **Total counts get expensive.** An exact `COUNT(*)` over a filtered set of that size is a full
  scan. Either show an approximate count, or drop the total and show next/previous, which is
  what keyset pagination naturally offers.
- **Row virtualisation** once `perPage` exceeds a few hundred. That already ships here, so the
  work is switching it on by default rather than building it.
- **Indexes matching the sortable columns.** Every column exposed as sortable needs a supporting
  index, or sorting becomes the slow path.

### Aggregation

`/api/stats` is already the right shape, computed away from the client. At scale it stops being
a live query and becomes a materialised view or a periodically refreshed rollup table, with the
endpoint reading the rollup. The client contract does not change at all, which is the point of
having drawn the boundary there.

### Many concurrent administrators

This is the part the current implementation does not handle, and I would not claim otherwise.
Two admins editing the same ticket: last write wins, silently.

The fix is optimistic concurrency control. Every entity carries a `version` or `ETag`, mutations
send `If-Match`, and the server returns 409 when it does not match. The client already has the
vocabulary: `ApiError.isConflict` exists and is used for referential integrity, so surfacing
"someone else changed this record, reload and reapply" is a form-level message, not new
infrastructure.

Beyond that, server-sent events or WebSockets to invalidate lists other admins have open. I
would add per-entity locking only if genuine edit contention appeared, since it usually does not
and pessimistic locking costs more than it saves.

### Client-side performance

Routes are lazy-loaded already and requests are cancelled when superseded. The next step is a
server-state cache with request deduplication and background revalidation.

The candidate I would reach for is Pinia Colada, from the Pinia and Vue Router author. It is the
Vue-native answer: it *is* a Pinia layer, not a second state container sitting beside the
mandated one, so the brief's constraint stops being a reason to avoid caching and becomes where
the caching lives. `useCollectionState` is the seam it would slot behind, and the stores' public
surface would not change, which is why it can wait.

TanStack Query has Vue bindings and would also work, but it is a React-first library with a Vue
adapter, and adopting it here would mean two competing notions of where server state lives. I
reached for neither in this build, because I wanted the state management legible instead of
delegated, and because a cache is worth adding when there is measured refetch pressure.

---

## 6. Coding standards and quality checks I would introduce

Most of these are in the repository already. The ones that are not are marked.

**Automated and blocking:**

- TypeScript at maximum strictness: `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`. These catch a real class of bug, and they are far cheaper to adopt
  on day one than to retrofit later.
- Architectural boundaries as lint rules, with tests over the rules. This is the practice from
  this codebase I would push hardest for on a team. Architecture written in a document drifts
  away from the code; architecture written as a lint rule cannot.
- One quality gate, run identically locally and in CI: typecheck, lint, format, test, build. It
  must never be weakened to go green. No loosened config, no `.skip`, no deleted assertion. A
  gate you can negotiate with stops being a gate.
- CI smoke-tests the running container, not just the build. Two defects in this submission's
  Docker setup were invisible in the Dockerfile and obvious the moment the image was started and
  curled.
- *(Not yet here)* axe accessibility checks in CI, and a bundle-size budget that fails the build
  on regression.

**Conventions, enforced by review:**

- Tests query by role, label and visible text, and use `data-testid` only where there is no
  accessible handle. This is not purism. Accessibility defects in this build were found only
  because the tests query the way a screen reader does; `data-testid` selectors would have
  passed straight over them.
- MSW is the only mock. If a test needs six mocks, look at the design before the test.
- Before trusting a new test, break the code and watch it fail.
- Reasoning lives next to the code it explains. A comment above the surprising line survives
  refactors and gets read by whoever is about to change it, which is not true of a separate
  document. Architecture-level reasoning belongs in a short README beside the layer it
  describes: `src/shared/api/README.md`, `src/features/README.md`, `src/mocks/README.md`.
- Conventional commits, with messages that explain why. The history is part of what the next
  person reads.

**Process:**

- Small PRs against a written plan, with the plan visible in the repository.
- A pre-submission audit that goes looking for what is missing instead of admiring what is
  present.

---

## 7. How AI fits into my daily development workflow on this project

The short answer is not "it writes code faster". It is that the workflow is committed to the
repository, so every contributor's agent, and every future session of my own, follows the same
architecture and is stopped by the same gates. The configuration under [`.claude/`](.claude/) is
as much a reviewable artefact as `eslint.config.js`.

### Two entry points, shared gates

```
new work ──▶ system-design ──▶ [design review] ──▶ user approves ──▶ implementation ──┐
                                                                                       ├──▶ code-review ──▶ /verify
bug report ─▶ bug-fix (repro ▸ root cause ▸ red-then-green) ───────────────────────────┘
```

Work enters through one of two doors and leaves through the same two gates. Nothing merges
without a written plan behind it and an audit in front of it.

### The skills, and what each is for

| Skill | Role |
|---|---|
| `system-design` | Turns a requirement into a layered plan, then an unambiguous task list. Nothing is built until the plan is approved. |
| `code-review` | Audits a diff against this repo's rules. Every finding cites a rule or a file and line, and carries a mechanical correction. |
| `bug-fix` | Reproduce, find the root cause, write the failing test, then fix. The regression test comes before the fix, not after. |
| `vue-feature` | The architecture itself: module boundaries, where code goes, the composable inventory, accessibility rules. |
| `crud-entity` | The nine layers of an entity slice, in order, so a fourth entity looks like the first three. |
| `testing-vue` | What each kind of test is for, and the traps this suite has already hit. |

There are also commands for the things that should never be improvised. `/verify` is the gate,
`/feature` drives a change end to end, and `/audit-brief` checks the whole thing against the
requirements.

### Why it is shaped this way

**Encode the architecture as executable rules, not prose.** This matters more with AI than
without. A generated file that crosses a module boundary is rejected by lint in seconds instead
of being argued about in review, and the boundary rules have tests, so the rules themselves
cannot rot. The same thinking applies to writing down traps the suite has already hit: the
`matchMedia` stub that has to model a real width, the `ResizeObserver` that has to be a class,
the table columns that have to be resolved through their headers. Each of those cost real
debugging time once. Written into the testing skill, they cost nobody that time again.

**Plan in the repository, before any code.** The failure mode worth designing against is not bad
code, it is efficiently building the wrong thing. A written plan is cheap to reject and a branch
is not. The design gate exists so the plan is fact-checked against the architecture before a
person is asked to spend attention on it.

**Bound the review loop.** Audits run at most two cycles and then escalate to a human. An agent
left to iterate on its own findings will converge on something that satisfies the audit instead
of something correct.

**Dispatch heavy phases to subagents.** Codebase analysis, both audits, and each implementation
task run in their own context and hand off through files. The parent session stays lean, which
is what keeps a long piece of work coherent.

**Ask for measurements on abstraction decisions.** "This is more reusable" is the kind of claim
that sounds right and is often wrong, and it is the first claim an agent reaches for. The
standard here is a third real consumer before extraction, and a line count when the abstraction
is contested. That rule lives in the skills, so it applies without me restating it.

**Verify in the real thing.** Several defects here passed typecheck, lint and the whole suite,
and were only visible in a browser or a running container: a clipped button, nginx headers
served on nothing, client-side routes returning 404. Browser and container checks are part of
the loop, not a flourish at the end.

### Where I expect the most leverage next

- **The fourth entity slice.** The shape is written down in `crud-entity`, so adding a new domain
  entity should be close to mechanical, and the boundary tests catch it if it is not.
- **The refactors in §4.** `useEntityPage` and the `BaseDataTable` split are well-specified,
  test-covered and low-ambiguity. That is the work where a plan-then-execute loop with a review
  gate beats doing it by hand, and it is safe because the suite is the arbiter.
- **Migrating off PrimeVue, if it ever comes to that.** The adapter layer and the role-based
  tests were built so this is a one-directory change. It is large, repetitive, well-fenced, and
  has an objective success criterion in that the suite stays green. Of everything here, that is
  the task I would hand over with the most confidence.
- **Keeping the skills current.** When a review finding repeats, it belongs in a skill instead of
  in another review. The workflow should get sharper with use.
