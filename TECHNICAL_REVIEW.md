# Technical Review

Assembled from [docs/DECISIONS.md](docs/DECISIONS.md), which was written entry by entry as the
work happened rather than reconstructed afterwards.

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
`tests/architecture/boundaries.spec.ts` writes ten deliberate violations to disk, lints them,
and asserts each is rejected — plus three sanctioned dependencies it asserts are still
allowed, so a rule tightened into uselessness cannot pass as a win.

That test exists because of a real near-miss. The first version of the config was silently
broken: flat config *replaces* a rule's options when a later entry configures the same rule
rather than merging them, so the per-feature `no-restricted-imports` block had quietly
disabled the PrimeVue boundary for all feature code — with `pnpm lint` fully green. Nothing
short of an executable check would have found it. The configs are now mutually disjoint, which
removes the hazard rather than patching one instance of it.

### The store owns data; `useTable` owns the query

An earlier iteration had `useTable` holding `rows` and `meta` — and the store would have held
them too. The same page of server state in two places, free to disagree. Splitting the
responsibilities removed that whole class of bug and gave the mandated Pinia layer real work
instead of a parallel cache.

`useCollectionState<T>()` then supplies state and derived flags to all three entity stores, so
that layer is written once rather than copy-pasted three times.

### PrimeVue behind an adapter layer

Feature code sees 15 `Base*` components with our own prop APIs; PrimeVue is confined to one
directory and the app bootstrap. Tests query by role, label and visible text, so the suite
would survive replacing the kit.

The boundary has already paid twice. It rejected a direct PrimeVue import in a new dashboard
component, and it exposed that `BaseButton` was leaking PrimeVue's internal semantics —
PrimeVue decides icon-only styling from `hasIcon && !label` and never looks at slot content,
so `icon` plus slot text rendered a 40 px button with the label clipped mid-word.

### Querying is genuinely server-side

Search, filter, sort and paginate all run in the handler, in that order, behind one
`{ data, meta }` envelope. `tests/mock-api/querying.spec.ts` proves it: pages are disjoint,
walking all 25 pages returns exactly 250 distinct ids, and sorting picks the global extreme
rather than the current page's. This is the decision that makes the scaling answer in §5
credible rather than aspirational.

### One mock backend, two runtimes

MSW handlers run in a Service Worker for the browser and in Node for Vitest. Tests exercise
the same request path the application does — there is no second set of stubs to drift.

---

## 2. What I would do with two more days

Every bonus on the brief's list shipped, so this is no longer a list of features. It is the
work that would make me comfortable putting this in front of real administrators.

**Day one — close the one correctness gap, and the duplication I can name.**

1. **Server-backed relation pickers.** The single piece of debt that becomes a *wrong answer*
   rather than a slow one (see §3). Half a day including tests.
2. **A `useEntityPage` composable.** The three list pages are 320–490 lines and a good third
   of that is now identical: dialog open/close state, the delete confirmation with its
   in-dialog 409 message, and the refresh-and-adopt-page dance after a mutation. Three real
   consumers exist, which is the standard the rest of the codebase was held to — `useListView`,
   `useBulkAction` and `BaseBulkFailures` were all extracted on exactly that trigger during the
   final audit, and this is the next one in line.
3. **Widen bulk and import beyond where they were demonstrated.** Import is tickets-only, and
   the `handleBulk`/`useBulkAction` pair is already generic enough that the remaining work is
   wiring rather than design.

**Day two — the things a real deployment needs.**

4. **Playwright smoke tests** against the Docker image: login, one CRUD round trip per entity,
   one deep link. jsdom cannot catch a CSS regression, a focus trap that does not trap, or a
   Service Worker that fails to register. Several defects in this build were found by looking
   at a browser, not by the suite.
5. **Bundle work with measurements.** The largest chunk is 627 kB raw / 148 kB gzipped and I
   have not profiled why. I removed manual chunk splitting early precisely because guessing at
   it without numbers is not engineering, and I am not going to start guessing now.
6. **Real accessibility auditing** — axe in CI plus a keyboard-only pass over every dialog.
   Accessibility was treated as a correctness property throughout (§1), and three defects still
   reached the browser during this build; all three were caught by tests that query the way a
   screen reader does, but I would not claim that is sufficient coverage.
7. **Decide what the view-mode switch is.** It ships labelled "DEMO" because shipping both
   rendering strategies is a demonstration, not a product decision. A real portal picks one per
   screen, and that choice needs data I do not have.

---

## 3. Technical debt I accepted deliberately

**Relation pickers cap at 200 options.** `fetchOptions()` loads up to 200 `{id, name}` pairs
and the picker filters client-side. With 30 events that is everything. Past a few hundred it
*silently omits* some — worse than being slow, because nothing tells the user. This is the
clearest piece of debt in the codebase and the first thing I would fix. The remedy is
localised: `BaseSelect` already supports `filterable`, so it is a matter of making that filter
server-backed and pinning the selected option so it survives falling outside the result page.

**MSW ships in the production bundle** — ~162 kB gzipped, lazy-imported behind an env flag.
Deliberate: this application has no other backend and the brief asks for a demonstrable one. A
real deployment sets `VITE_ENABLE_MOCK_API=false` and the chunk never loads.

**Three list pages share a shape but not code.** ~120 lines of near-identical dialog and
delete handling across Categories, Events and Tickets. I left it because the third slice is
where the real commonality finally became visible, and extracting on the second would have
locked in the wrong seams. It is now ready to extract — see §4.

**No E2E layer.** Integration tests drive the real router, stores and mock backend, but in
jsdom. Everything about real layout, real focus management and real Service Worker
registration is untested.

**`pageValueByCurrency` sums only the loaded page.** Correct and labelled as such, but a user
could reasonably read it as a total. The dashboard has the real server-aggregated figure; this
one exists because the page already has the data.

**Storage-blocked browsers degrade quietly.** If `localStorage` throws (Safari private mode),
the session and theme still work for the tab but do not persist. Handled, not surfaced.

---

## 4. What I would refactor first

**1. Extract `useEntityPage`.** The highest-value refactor, and the one with three proven
consumers. It would own dialog open/close state, the delete-confirmation lifecycle, and the
refresh-then-adopt-page dance after a mutation. Roughly 120 lines removed and, more
importantly, one place to fix a bug in that flow instead of three.

**2. Split `BaseDataTable`.** It is the largest component in the codebase and carries two
responsibilities: the desktop grid and the mobile card list. They share only props. Two
components behind one entry point would each be simpler than the current branch.

**3. Make the money and date utilities locale-aware.** Both hard-code `en-GB` / `de-DE` / 
`en-US` conventions. An admin portal used across the countries in the seed data should take
the locale from the user, not from a constant. The seam exists — `formatMoney` and
`formatDate` are already the only formatting points.

**4. Reconsider the `zodSchema` adapter.** Forty lines of ours, needed only because
`@vee-validate/zod` targets zod 3. When vee-validate ships Standard Schema support, the
adapter deletes itself. Worth a calendar reminder rather than a rewrite.

---

## 5. Scaling to hundreds of thousands of tickets and many concurrent administrators

### Reading data

The foundation is already right: **nothing is ever counted or filtered in the browser**.
Search, filter, sort and pagination run server-side, `perPage` is capped at 100, and the
dashboard's figures come from a dedicated aggregation endpoint rather than from a collection
the client reduces. Those are the decisions that are expensive to retrofit, and they are made.

What changes at 250,000 rows:

- **Offset pagination becomes the bottleneck.** `OFFSET 240000` makes the database walk rows
  it will discard. Move to **keyset (cursor) pagination** ordered by `(sort_key, id)`. The
  client contract changes from `page` to `cursor`, which is contained inside `useTable` and
  the `{ data, meta }` envelope — one composable and one type.
- **Total counts get expensive.** An exact `COUNT(*)` over a filtered set of that size is a
  full scan. Either show an approximate count, or drop the total and show "next/previous",
  which is what keyset pagination naturally offers.
- **Row virtualisation** once `perPage` exceeds a few hundred. `BaseDataTable` is the only
  component that would change.
- **Indexes matching the sortable columns.** Every column exposed as sortable needs a
  supporting index, or sorting becomes the slow path.

### Aggregation

`/api/stats` is already the right shape — computed away from the client. At scale it stops
being a live query and becomes a materialised view or a periodically refreshed rollup table,
with the endpoint reading the rollup. The client contract does not change at all, which is the
point of having drawn the boundary there.

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
proper server-state cache with deduplication and background revalidation — TanStack Query is
the obvious candidate, and `useCollectionState` is the seam it would slot behind. I did not
reach for it here because the brief mandates Pinia and I wanted the state management legible
rather than delegated.

---

## 6. Coding standards and quality checks I would introduce

Most of these are in the repository already; the ones that are not are marked.

**Automated, blocking:**

- **TypeScript at maximum strictness** — `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`. These catch a real class of bug, and they are far cheaper to
  adopt on day one than to retrofit.
- **Architectural boundaries as lint rules, with tests over the rules.** The single practice
  from this codebase I would push hardest for on a team. Documented architecture decays;
  executable architecture does not.
- **One quality gate, run identically locally and in CI** — typecheck, lint, format, test,
  build. It must never be weakened to go green: no loosened config, no `.skip`, no deleted
  assertion. A gate that can be bargained with is not a gate.
- **CI smoke-tests the running container**, not just the build. Two defects in this
  submission's Docker setup were invisible in the Dockerfile and obvious the moment the image
  was started and curled.
- *(Not yet here)* **axe accessibility checks** in CI, and **a bundle-size budget** that fails
  the build on regression.

**Conventions, enforced by review:**

- Tests query by role, label and visible text — never by `data-testid` unless there is no
  accessible handle. This is not purism: two of the accessibility defects in this build were
  found *only* because the tests query the way a screen reader does. `data-testid` selectors
  would have passed on both.
- MSW is the only mock. If a test needs six mocks, the design is wrong.
- Before trusting a new test, break the code and watch it fail. I did this for the
  architecture suite and it was worth the minute.
- Every non-obvious decision gets a decision-log entry when it is made, including what it
  costs. Reconstructing reasoning at review time produces justification, not reasoning.
- Conventional commits, and commit messages that explain *why* — the history is part of what
  the next person reads.

**Process:**

- Small PRs against a written plan, with the plan visible in the repository.
- A pre-submission adversarial audit (`/audit-brief` here) that looks for what is missing
  rather than admiring what is present.

---

## 7. How AI fits into my daily workflow on this project

This codebase was built with heavy AI assistance, so I can be specific rather than theoretical.

**Where it was clearly worth it**

- **Volume with a fixed shape.** Once the first entity slice existed, the second and third
  were mostly mechanical. The third slice cost a fraction of the first — that is the pattern
  AI accelerates best.
- **Tests.** Writing 690 tests by hand is where fatigue produces shallow assertions. AI is
  good at enumerating boundary cases, which is exactly what a schema or a money utility needs.
- **Investigative grunt work.** Auditing the assessment PDF for hidden content, checking
  PrimeVue 5's licence and reading the actual `LICENSE.md`, diffing `@vee-validate/zod`'s
  internals against Zod 4. All tedious, all quick, all high-value.
- **Writing down the reasoning.** The decision log stayed current because recording an entry
  cost nothing at the moment of deciding.

**Where it needed hard supervision**

- **It over-abstracts by default.** I had to measure and delete a `createResource` factory
  that cost 62 lines to save 25 — and which had *zero consumers* when it was written. AI
  reaches for the general case early; the correct response is to demand the numbers.
- **Confident wrong claims.** An accessibility finding was reported as "≈4.0:1, fails WCAG AA"
  from an eyeball estimate. Computed properly it was 4.76:1 and passed. The lesson is
  structural, not incidental: **make the check executable**. There is now a contrast test
  computing real ratios from the shipped palette.
- **Tests that assert nothing.** Several ticket tests were passing against skeleton rows,
  because counting `tbody tr` is satisfied before data arrives and every cell reads as an
  empty string. Green, and measuring nothing.

**How I would run a team with it**

1. **Plan first, in the repository.** A written phased plan the work is checked against —
   without it, AI is happy to build the wrong thing efficiently.
2. **Encode the architecture as executable rules.** This matters more with AI than without:
   a generated file that violates a boundary is caught by lint in seconds instead of in review.
3. **Never merge a test you have not seen fail.**
4. **Demand measurements for abstraction decisions**, because "this is more reusable" is
   exactly the kind of claim that sounds right and is often wrong.
5. **Verify in the real thing.** Several defects here — the clipped button, the nginx headers,
   the 404ing routes, the money field losing keystrokes — passed typecheck, lint and tests, and
   were only visible in a browser or a running container.
6. **Own the output.** Every line here is code I would defend in review. Where I could not
   defend it, I deleted it — and one of those deletions came from a reviewer pushing back on
   layering, which was the right call and is now recorded as such.

The honest summary: AI moved this from roughly a week of work to a day, and the quality
ceiling was set by how rigorously its output was checked — not by the model. The bugs it found
in *my* reasoning and the bugs I found in *its* output were about evenly matched.
