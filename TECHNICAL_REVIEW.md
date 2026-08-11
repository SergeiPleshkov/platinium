# Technical Review

---

## 1. Main architectural decisions

### Vertical feature slices, with boundaries the build enforces

The app is organised by feature, not by technical role: `features/tickets/` holds its types,
schema, endpoints, store, components and pages together. The dependency direction is
`app → features → shared`, and it is enforced by ESLint rather than by review:

- a feature cannot import another feature's internals, only its public `index.ts`
- a feature cannot import `app/`
- `shared/` cannot import `features/` or `app/`
- `primevue/*` only inside `shared/ui`, `axios` only inside `shared/api`, `fetch` nowhere else

The part I would defend hardest is that **the rules have their own tests**.
`tests/architecture/boundaries.spec.ts` writes deliberate violations to disk, lints them, and
asserts each is rejected — plus sanctioned dependencies it asserts are still allowed, so a rule
tightened into uselessness cannot pass as a win.

That test exists because of a real near-miss. The first version of the config was silently
broken: flat config *replaces* a rule's options when a later entry configures the same rule
rather than merging them, so the per-feature `no-restricted-imports` block had quietly disabled
the PrimeVue boundary for all feature code — with `pnpm lint` fully green. Nothing short of an
executable check would have found it. The configs are now mutually disjoint, which removes the
hazard rather than patching one instance of it.

### The store owns data; `useTable` owns the query

An earlier iteration had `useTable` holding `rows` and `meta` — and the store would have held
them too. The same page of server state in two places, free to disagree. Splitting the
responsibilities removed that whole class of bug and gave the mandated Pinia layer real work
instead of a parallel cache.

`useCollectionState<T>()` then supplies state and derived flags to all three entity stores, so
that layer is written once rather than copy-pasted three times.

### PrimeVue behind an adapter layer

Feature code sees `Base*` components with our own prop APIs; PrimeVue is confined to one
directory and the app bootstrap. Tests query by role, label and visible text, so the suite would
survive replacing the kit.

The boundary has already paid twice. It rejected a direct PrimeVue import in a new dashboard
component, and it exposed that `BaseButton` was leaking PrimeVue's internal semantics — PrimeVue
decides icon-only styling from `hasIcon && !label` and never looks at slot content, so `icon`
plus slot text rendered a small button with the label clipped mid-word.

The kit is also *allowed* to contain hand-written primitives, which is the point of it being
ours. `BaseSegmentedControl` does not wrap PrimeVue's `SelectButton`, because that renders
`aria-pressed` toggles — announcing as three independent buttons rather than one choice of
three. A radio group needs roving tabindex and arrow keys; correct semantics beat a wrapper
fighting its wrapped component.

### One error type at the API boundary

Every failure — dropped connection, timeout, 422, 500, a request we deliberately superseded —
leaves `shared/api` as a single `ApiError` carrying `isValidation` / `isConflict` /
`isRetryable` / `isAborted`. Those are application vocabulary, not HTTP trivia: a store asks
`if (error.isValidation)`, and the day a backend starts returning 400 for validation the answer
changes in one place. The layer is documented in
[`src/shared/api/README.md`](src/shared/api/README.md).

Two rules make it consistent across every store: **`fetchList` never throws** — a failed list is
a state the page renders, not an exception every caller must remember to catch — and
**mutations always rethrow**, because the caller is a form that must decide whether to close.

### Querying is genuinely server-side

Search, filter, sort and paginate all run in the handler, in that order, behind one
`{ data, meta }` envelope. `tests/mock-api/querying.spec.ts` proves it: pages are disjoint,
walking every page returns exactly the seeded set with no duplicates, and sorting picks the
global extreme rather than the current page's. This is the decision that makes the scaling
answer in §5 credible rather than aspirational.

### Permissions are capabilities, and they are checked twice

One `ROLE_PERMISSIONS` matrix, imported by the UI **and** by the mock backend. A button asking
`can('delete')` keeps working when a fourth role appears; one asking `role === 'admin'` has to
be found and edited, and the ones nobody finds are the bugs.

Hiding a delete button stops an honest mistake and nothing else — the request still succeeds
from a console, or from a stale tab whose role was downgraded. The server re-checks against the
same import, and the API tests make each forbidden call anyway, asserting both the 403 and that
the data did not change. 403 is deliberately not routed through the 401 hook: conflating them
would eject a viewer from the application for clicking something they were not allowed to click.

### Accessibility as a correctness property

Several decisions were made *against* the simpler implementation for it, and the tests are
written so that undoing them goes red.

HTML5 drag and drop has no keyboard equivalent whatsoever, so the drag handle is a focusable
button carrying its own position and the arrow keys call the *same* reorder function the drop
does — not a fallback beside the real feature, the same feature reached differently. Exactly one
live region per announcement, because a spinner nested inside a container that is also a live
region announces the same wait twice — invisible in a screenshot, obvious to a screen reader.
Composite widgets are labelled by `aria-labelledby`, because PrimeVue's `Select` renders a
`<div>` root and a `<label for>` would associate with nothing. Colour never carries meaning
alone.

### One mock backend, two runtimes

MSW handlers run in a Service Worker for the browser and in Node for Vitest. Tests exercise the
same request path the application does — there is no second set of stubs to drift.

---

## 2. What I would do with two more days

Every bonus on the brief's list shipped, so this is no longer a list of features. It is the work
that would make me comfortable putting this in front of real administrators.

**Day one — close the one correctness gap, and the duplication I can name.**

1. **Server-backed relation pickers.** The single piece of debt that becomes a *wrong answer*
   rather than a slow one (see §3). Half a day including tests.
2. **A `useEntityPage` composable.** The three list pages are large and a good third of each is
   now identical: dialog open/close state, the delete confirmation with its in-dialog 409
   message, and the refresh-and-adopt-page dance after a mutation. Three real consumers exist,
   which is the standard the rest of the codebase was held to — `useListView`, `useBulkAction`
   and `BaseBulkFailures` were all extracted on exactly that trigger, and this is next in line.
3. **Widen bulk and import beyond where they were demonstrated.** Import is tickets-only, and
   the `handleBulk`/`useBulkAction` pair is already generic enough that the remaining work is
   wiring rather than design.

**Day two — the things a real deployment needs.**

4. **Playwright smoke tests** against the Docker image: login, one CRUD round trip per entity,
   one deep link. jsdom cannot catch a CSS regression, a focus trap that does not trap, or a
   Service Worker that fails to register. Several defects in this build were found by looking at
   a browser, not by the suite.
5. **A bundle-size budget in CI.** Hand-grouping the vendor chunks was tried and reverted: it
   pulls every route's PrimeVue components in eagerly and made the dashboard's first load
   materially worse than the bundler's own route-aware splitting. That is the right shape of
   answer — a measurement, then a decision — but it should be a gate that fails the build on
   regression rather than something someone remembers to check.
6. **Real accessibility auditing** — axe in CI plus a keyboard-only pass over every dialog.
   Accessibility was treated as a correctness property throughout (§1), and defects still reached
   the browser during this build; they were caught by tests that query the way a screen reader
   does, but I would not claim that is sufficient coverage.
7. **Decide what the view-mode switch is.** It ships labelled "DEMO" because shipping both
   rendering strategies is a demonstration, not a product decision. A real portal picks one per
   screen, and that choice needs data I do not have.

---

## 3. Technical debt I accepted deliberately

**Relation pickers cap their option list.** `fetchOptions()` loads a bounded page of
`{id, name}` pairs and the picker filters client-side. At the seeded data size that is
everything. Past a few hundred it *silently omits* some — worse than being slow, because nothing
tells the user. This is the clearest piece of debt in the codebase and the first thing I would
fix. The remedy is localised: `BaseSelect` already supports `filterable`, so it is a matter of
making that filter server-backed and pinning the selected option so it survives falling outside
the result page.

**MSW ships in the production bundle**, lazy-imported behind an env flag. Deliberate: this
application has no other backend and the brief asks for a demonstrable one. A real deployment
sets `VITE_ENABLE_MOCK_API=false` and the chunk never loads.

**Three list pages share a shape but not code.** Near-identical dialog and delete handling across
Categories, Events and Tickets. I left it because the third slice is where the real commonality
finally became visible, and extracting on the second would have locked in the wrong seams. It is
now ready to extract — see §4.

**No E2E layer.** Integration tests drive the real router, stores and mock backend, but in jsdom.
Everything about real layout, real focus management and real Service Worker registration is
untested.

**`pageValueByCurrency` sums only the loaded page.** Correct and labelled as such, but a user
could reasonably read it as a total. The dashboard has the real server-aggregated figure; this
one exists because the page already has the data.

**Storage-blocked browsers degrade quietly.** If `localStorage` throws (Safari private mode), the
session and theme still work for the tab but do not persist. Handled, not surfaced.

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
from the user, not from a constant. The seam exists — `formatMoney` and `formatDate` are already
the only formatting points.

**4. Reconsider the `zodSchema` adapter.** A small adapter of ours, needed only because
`@vee-validate/zod` targets zod 3. When vee-validate ships Standard Schema support, the adapter
deletes itself. Worth a calendar reminder rather than a rewrite.

---

## 5. Scaling to hundreds of thousands of tickets and many concurrent administrators

### Reading data

The foundation is already right: **nothing is ever counted or filtered in the browser**. Search,
filter, sort and pagination run server-side, `perPage` is capped, and the dashboard's figures
come from a dedicated aggregation endpoint rather than from a collection the client reduces.
Those are the decisions that are expensive to retrofit, and they are made.

What changes at a quarter of a million rows:

- **Offset pagination becomes the bottleneck.** A deep `OFFSET` makes the database walk rows it
  will discard. Move to **keyset (cursor) pagination** ordered by `(sort_key, id)`. The client
  contract changes from `page` to `cursor`, which is contained inside `useTable` and the
  `{ data, meta }` envelope — one composable and one type.
- **Total counts get expensive.** An exact `COUNT(*)` over a filtered set of that size is a full
  scan. Either show an approximate count, or drop the total and show "next/previous", which is
  what keyset pagination naturally offers.
- **Row virtualisation** once `perPage` exceeds a few hundred. That already ships here, so the
  work is switching it on by default rather than building it.
- **Indexes matching the sortable columns.** Every column exposed as sortable needs a supporting
  index, or sorting becomes the slow path.

### Aggregation

`/api/stats` is already the right shape — computed away from the client. At scale it stops being
a live query and becomes a materialised view or a periodically refreshed rollup table, with the
endpoint reading the rollup. The client contract does not change at all, which is the point of
having drawn the boundary there.

### Many concurrent administrators

This is the part the current implementation genuinely does not handle, and I would not claim
otherwise. Two admins editing the same ticket: last write wins, silently.

The fix is **optimistic concurrency control** — every entity carries a `version` or `ETag`,
mutations send `If-Match`, and the server returns **409** when it does not match. The client
already has the vocabulary for this: `ApiError.isConflict` exists and is used for referential
integrity, so surfacing "someone else changed this record — reload and reapply" is a form-level
message, not new infrastructure.

Beyond that: server-sent events or WebSockets to invalidate lists other admins have open, and
per-entity locking only if genuine edit contention appears — it usually does not, and pessimistic
locking costs more than it saves.

### Client-side performance

Routes are already lazy-loaded and requests are cancelled when superseded. The next step is a
proper server-state cache with request deduplication and background revalidation.

The candidate I would reach for is **Pinia Colada**, from the Pinia and Vue Router author. It is
the Vue-native answer to this problem: it *is* a Pinia layer rather than a second state
container sitting beside the mandated one, so the brief's constraint stops being a reason to
avoid caching and starts being where the caching lives. `useCollectionState` is the seam it would
slot behind — the stores' public surface would not change, which is why it can wait.

TanStack Query has Vue bindings and would also work, but it is a React-first library with a Vue
adapter, and adopting it here would mean two competing notions of where server state lives. I
did not reach for either in this build because I wanted the state management legible rather than
delegated, and because a cache is worth adding when there is measured refetch pressure, not
before.

---

## 6. Coding standards and quality checks I would introduce

Most of these are in the repository already; the ones that are not are marked.

**Automated, blocking:**

- **TypeScript at maximum strictness** — `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`. These catch a real class of bug, and they are far cheaper to adopt
  on day one than to retrofit.
- **Architectural boundaries as lint rules, with tests over the rules.** The single practice from
  this codebase I would push hardest for on a team. Documented architecture decays; executable
  architecture does not.
- **One quality gate, run identically locally and in CI** — typecheck, lint, format, test, build.
  It must never be weakened to go green: no loosened config, no `.skip`, no deleted assertion. A
  gate that can be bargained with is not a gate.
- **CI smoke-tests the running container**, not just the build. Two defects in this submission's
  Docker setup were invisible in the Dockerfile and obvious the moment the image was started and
  curled.
- *(Not yet here)* **axe accessibility checks** in CI, and **a bundle-size budget** that fails the
  build on regression.

**Conventions, enforced by review:**

- Tests query by role, label and visible text — never by `data-testid` unless there is no
  accessible handle. This is not purism: accessibility defects in this build were found *only*
  because the tests query the way a screen reader does. `data-testid` selectors would have passed.
- MSW is the only mock. If a test needs six mocks, the design is wrong.
- Before trusting a new test, break the code and watch it fail.
- **Reasoning lives next to the code it explains.** A comment above the surprising line survives
  refactors, gets read by whoever is about to change it, and cannot drift into a stale document
  nobody opens. Architecture-level reasoning belongs in a short README beside the layer it
  describes — `src/shared/api/README.md`, `src/features/README.md`, `src/mocks/README.md`.
- Conventional commits, and commit messages that explain *why* — the history is part of what the
  next person reads.

**Process:**

- Small PRs against a written plan, with the plan visible in the repository.
- A pre-submission adversarial audit that looks for what is missing rather than admiring what is
  present.

---

## 7. How AI fits into my daily development workflow on this project

My answer is not "I use it to write code faster". It is that **the workflow is committed to the
repository**, so every contributor's agent — and every future session of my own — behaves the
same way, follows the same architecture, and is stopped by the same gates. The configuration
under [`.claude/`](.claude/) is as much a reviewable artefact as `eslint.config.js`.

### Two entry points, shared gates

```
new work ──▶ system-design ──▶ [design review] ──▶ user approves ──▶ implementation ──┐
                                                                                       ├──▶ code-review ──▶ /verify
bug report ─▶ bug-fix (repro ▸ root cause ▸ red-then-green) ───────────────────────────┘
```

Everything enters through one of two doors and leaves through the same two gates. Nothing merges
without a written plan behind it and an audit in front of it.

### The skills, and what each is for

| Skill | Role |
|---|---|
| `system-design` | Turns a requirement into a layered plan and then an unambiguous task list. Nothing is built until the plan is approved. |
| `code-review` | Hard-facts audit of a diff against this repo's rules. Every finding must cite a rule or a file and line, and carry a mechanical correction. |
| `bug-fix` | Reproduce first, find the root cause, write the failing test, then fix. A bug without a regression test is not fixed. |
| `vue-feature` | The architecture itself: module boundaries, where code goes, the composable inventory, accessibility rules. |
| `crud-entity` | The nine layers of an entity slice, in order, so a fourth entity looks like the first three. |
| `testing-vue` | What each kind of test is for, and the traps this suite has already hit. |

Plus commands for the things that should never be improvised: `/verify` is the gate,
`/feature` drives a change end to end, `/audit-brief` checks the whole thing against the
requirements.

### Why it is shaped this way

**Encode the architecture as executable rules, not prose.** This matters more with AI than
without. A generated file that crosses a module boundary is rejected by lint in seconds instead
of being argued about in review — and the boundary rules have tests, so the rules themselves
cannot rot. The same reasoning drives writing down the traps a suite has already hit: the
`matchMedia` stub that must model a real width, the `ResizeObserver` that must be a class, the
table columns that must be resolved through their headers. Each of those cost real debugging
time once. Written into the testing skill, they cost nobody that time again.

**Plan in the repository, before any code.** The failure mode worth designing against is not bad
code — it is efficiently building the wrong thing. A written plan is cheap to reject; a branch
is not. The design gate exists so the plan is fact-checked against the architecture before a
human is asked to spend attention on it.

**Bound the review loop.** Audits run at most two cycles and then escalate to a person. An agent
allowed to iterate on its own findings indefinitely will converge on something that satisfies
the audit rather than something correct.

**Dispatch heavy phases to subagents.** Codebase analysis, the two audits and each implementation
task run in their own context and hand off through files. The parent stays lean, which is what
keeps a long session coherent rather than drifting.

**Demand measurements for abstraction decisions.** "This is more reusable" is exactly the kind of
claim that sounds right and is often wrong, and it is the claim an agent reaches for first. The
standard in this codebase is a third real consumer before extraction, and a line count when the
abstraction is contested. That rule is in the skills, so it applies without me restating it.

**Verify in the real thing.** Several defects here passed typecheck, lint and the whole suite and
were only visible in a browser or a running container — a clipped button, nginx headers served on
nothing, client-side routes 404ing. Browser and container verification are part of the loop, not
a final flourish.

### Where I expect the most leverage next

- **The fourth entity slice.** The shape is written down in `crud-entity`; adding a new domain
  entity should be close to mechanical, and the boundary tests catch it if it is not.
- **The refactors in §4.** `useEntityPage` and the `BaseDataTable` split are well-specified,
  test-covered and low-ambiguity — exactly the work where a plan-then-execute loop with a review
  gate is faster than doing it by hand, and safe because the suite is the arbiter.
- **Migrating off PrimeVue, if it ever comes to that.** The adapter layer and the role-based
  tests were built so this is a one-directory change. It is a large, repetitive, well-fenced
  task with an objective success criterion — the suite stays green. That is the profile of work
  I would hand to an agent with the most confidence.
- **Keeping the skills current.** When a review finding repeats, it belongs in a skill rather
  than in another review. The workflow is supposed to get sharper with use.
