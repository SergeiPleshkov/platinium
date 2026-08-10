# Decision log

Append-only. One entry per decision worth defending or trade-off worth admitting, written
when it's made — not reconstructed at the end. `TECHNICAL_REVIEW.md` is assembled from this.

Format:

```
## <date> — <decision, in a few words>
**Chose:** what we did
**Over:** the alternative(s)
**Because:** the reasoning, including what it costs us
**Revisit if:** the condition that would change the answer
```

---

## 2026-08-10 — Vue 3 + Vite + Pinia + MSW as the baseline

**Chose:** Vue 3 `<script setup>` + TypeScript strict, Vite, Pinia setup stores, Vue Router 4,
MSW for the mock API.
**Over:** Nuxt (SSR not needed for an admin portal behind a login, and it would obscure the
routing/state architecture the brief asks to see); Vuex (legacy, weaker TS inference);
MirageJS or json-server (MSW's handlers run in both the browser and Vitest, so there is one
mock backend rather than two).
**Because:** the brief mandates Vue 3, Pinia-or-Vuex, Vue Router, TypeScript and Docker. The
open choices were picked to maximise how much of the architecture is visible and testable.
**Revisit if:** the app ever needs SSR or public SEO-indexed pages.

## 2026-08-10 — PrimeVue behind an in-house adapter layer

**Chose:** PrimeVue 4 (custom Aura preset) for the component layer, consumed exclusively
through our own `shared/ui` `Base*` wrappers. Direct `primevue/*` imports are blocked
outside `src/shared/ui/**` by an ESLint `no-restricted-imports` rule.
**Over:** (a) hand-building every primitive on Tailwind — better craftsmanship signal, but
spends a large share of the budget on an accessible DataTable, date picker and dialog that
a mature library already gets right; (b) using PrimeVue directly in feature code — faster
today, but welds the app to one vendor.
**Because:** the deliverable is judged on architecture and delivery, and this buys both: a
polished, accessible, feature-dense portal now, with the vendor isolated to one directory.
The stated intent is that these wrappers may be reimplemented in-house later, so the
boundary is treated as a real contract — our own prop APIs, no PrimeVue types in feature
code, and tests that query by role and label rather than library internals, so the suite
stays green across the swap.
**Costs:** a wrapper layer to maintain, and some PrimeVue capability reachable only by
widening a wrapper rather than reaching for it inline.
**Revisit if:** the wrappers start out-massing what they wrap, or PrimeVue's theming fights
the design more than it helps — at which point the swap is a change to `shared/ui` alone,
which is the property being bought here.

## 2026-08-10 — Pinned to PrimeVue 4.5.5, not 5.x

**Chose:** `primevue@4.5.5` and `@primeuix/themes@2.0.3`, both exact pins, both MIT.
**Over:** the current latest, `primevue@5.0.0`.
**Because:** PrimeVue 5 is no longer open source. Its licence is "SEE LICENSE IN LICENSE.md",
which is the PrimeTek dual Community/Commercial licence: a licence key is required, an
offline verifier ships as a runtime dependency (`@primeui/license-manager`), and a missing or
expired key "may cause the software to display a license notice" in the running app. The
Community tier is also revenue- and headcount-gated with annual re-confirmation. None of that
belongs in a public assessment repository that a reviewer will clone and run. 4.5.5 is the
last MIT release and its dependency tree carries no licence manager.
**Costs:** we forgo PrimeVue 5 features and will not get 5.x security patches on this line.
**Revisit if:** the app needs a v5-only component, or the organisation buys a licence — and
note the adapter layer above makes leaving PrimeVue entirely a bounded change either way.

## 2026-08-10 — Maximal TypeScript strictness, including `exactOptionalPropertyTypes`

**Chose:** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noUnusedLocals`/`Parameters`, `noFallthroughCasesInSwitch`.
**Over:** plain `strict: true`.
**Because:** `noUncheckedIndexedAccess` is what makes paginated array access honest, and
`exactOptionalPropertyTypes` stops "the property is present and undefined" bugs at the API
boundary — exactly the class of bug a mock-backed CRUD app invites.
**Costs:** real friction. It rejected `withDefaults(..., { icon: undefined })` on the first
component written, and it forces conditional spreads instead of passing possibly-undefined
values into optional properties. Both are the rule working as intended.
**Revisit if:** never, on a greenfield project. Retrofitting these onto an existing codebase
is a different calculation.

## 2026-08-10 — axios for transport, our own `ApiError` for the contract

**Chose:** axios behind `@/shared/api`, with a request interceptor injecting the bearer token
and a response interceptor translating every failure into our `ApiError`. Direct `axios`
imports are blocked outside `src/shared/api` by lint.
**Over:** (a) the hand-rolled `fetch` wrapper this started as — about 90 lines of timeout,
abort, header and body plumbing that is a solved problem and not worth owning; (b) `ky` or
`ofetch`, which are fetch-native and ~4–5 kB against axios's ~13 kB gzipped.
**Because:** axios's interceptors express "inject auth" and "handle 401 once, centrally"
directly, and it is the client a reviewer recognises without reading it. Bundle size is not
the binding constraint for an authenticated admin portal.
**What stays ours:** the error contract. `ApiError` with `fieldErrors`, `isValidation`,
`isConflict`, `isRetryable` and `isAborted` is application vocabulary, not plumbing — without
it every store ends up writing `if (error.response?.status === 422)`, and swapping HTTP
libraries becomes a codebase-wide edit.
**Evidence the boundary is in the right place:** the fetch → axios swap changed one file and
all 22 API tests passed unmodified.
**Costs:** ~13 kB gzipped, and axios's fetch adapter is pinned explicitly (`adapter: 'fetch'`)
so the browser and Vitest use the same transport rather than XHR and Node's `http`.
**Revisit if:** bundle size becomes a real constraint — `ky` is a drop-in behind this same
wrapper, which is the point of having the wrapper.

## 2026-08-10 — nginx runtime: unprivileged image, headers per location

**Chose:** `nginxinc/nginx-unprivileged` (uid 101, port 8080) for the runtime stage, with the
security headers in an include pulled into every `location` block.
**Over:** stock `nginx:alpine` with a hand-rolled user, and server-level `add_header`.
**Because:** the unprivileged image needs no root anywhere in the runtime, and nothing in a
static-file server justifies it. The header placement is not stylistic: nginx inherits
`add_header` from an outer level *only* when the inner level declares none of its own. Every
location here sets `Cache-Control`, so the server-level security headers were silently served
on nothing. Verified against a running container rather than read off the config.
**Also found by running it:** `COPY a b /dest/` keeps the original filenames, so the site
config landed as `conf.d/nginx.conf` beside the base image's `conf.d/default.conf` — which
kept winning, 404ing every client-side route while `/` still worked via the directory index.
Two separate `COPY` lines. Both defects were invisible in the Dockerfile and obvious the
moment the image was started and curled, which is why CI smoke-tests the running container
rather than just building it.

## 2026-08-10 — Relation pickers load up to 200 options (accepted debt)

**Chose:** `fetchOptions()` on the events and categories stores, loading up to 200 `{id, name}`
pairs sorted by name, filtered client-side inside the picker.
**Over:** a server-backed type-ahead that queries as the user types.
**Because:** with 30 events and 10 categories this returns everything, and the type-ahead is
meaningfully more work (debounce, in-flight cancellation, preserving the selected option when
it falls outside the current result page) for no benefit at this size.
**Costs — stated plainly:** it does not scale. Past ~200 events the picker silently stops
showing some of them, which is worse than being slow. This is the clearest piece of
intentional debt in the codebase and belongs in `TECHNICAL_REVIEW.md` as such. The fix is
localised: `BaseSelect` already supports `filterable`, so it is a matter of making the filter
server-backed and keeping the selected option pinned.
**Note:** the options live in a *separate* store slice from `items`. Reusing the list state
would mean opening the ticket form silently replaced whichever page the events screen was
showing — a cross-screen bug that would be very hard to attribute.

## 2026-08-10 — `BaseFormField` distinguishes labellable from composite controls

**Chose:** a `labellable` flag on `BaseFormField`. Native inputs get `<label for>`; composite
widgets get `aria-labelledby` pointing at the label's id, and no `for` at all.
**Because:** PrimeVue's Select, MultiSelect and DatePicker render a `<div>`/`<span>` root. A
`<label for>` aimed at a non-labellable element associates with **nothing** — the field looks
labelled on screen and is anonymous to a screen reader. Both the country select and both date
pickers shipped that way and looked perfect; the integration test caught it because
`getByLabelText` refuses to resolve a label pointing at a non-labellable element.
**Worth noting:** this is the second accessibility defect found by querying the way a screen
reader does rather than by looking at the page. Tests that select by `data-testid` would have
passed on both.

## 2026-08-10 — Test timezone is pinned to UTC

**Chose:** `env: { TZ: 'UTC' }` in `vitest.config.ts`, plus comparing local date components in
`formatDateRange` so the comparison matches what `Intl` renders.
**Because:** `formatDateRange` compared UTC day boundaries while `Intl` formatted in the local
zone, so an event ending at 22:00 UTC was "the same day" by the check and a different day on
screen. The two can only agree if both use the same frame of reference. Pinning the runner's
zone additionally stops the suite passing locally and failing in CI, which is the worse
version of the same bug.

## 2026-08-10 — Our own zod adapter for vee-validate

**Chose:** `src/shared/validation/zodSchema.ts`, ~40 lines implementing vee-validate's
`TypedSchema` against Zod 4. `@vee-validate/zod` removed.
**Over:** keeping the official adapter, or downgrading to Zod 3.
**Because:** `@vee-validate/zod@4.15.1` peer-depends on `zod@^3` and reads Zod 3 internals —
`_def.defaultValue()`, which in Zod 4 is a value rather than a function. Any schema using
`.default()` throws during form setup; it took the category dialog down on first render, and
the login form had only been surviving by not using a default. vee-validate 4.15 has no
Standard Schema support either, so there is no supported path. Downgrading would mean
rewriting every schema in the application to satisfy a dependency that cannot follow us
forward.
**Costs:** ~40 lines of adapter to own, including the issue-grouping vee-validate expects.
**Revisit if:** vee-validate 5 ships Standard Schema support, at which point the adapter
deletes itself.

## 2026-08-10 — Store owns the data; `useTable` owns the query; state+getters are shared

Revisits the previous entry after a challenge about extensibility. Three parts:

**Per-feature `api.ts` is back, with a `Resource<T, P>` contract instead of a factory.**
The earlier measurement was correct about today and wrong about the trajectory. By phase 8,
tickets has bulk delete, CSV export, CSV import and stats — eight-plus endpoints — so "inline
it now, extract it when it reaches three" just schedules a migration. What is *not* back is
the factory: each `api.ts` spells out its own URLs, so the endpoint is visible where it is
called, while implementing a shared interface so cross-cutting behaviour (optimistic updates,
bulk operations, typed test doubles) can be written once against `Resource<T, P>`. Contract
without machinery.

**State and getters are shared, not split per entity by technical role.**
The request was `state.ts` / `getters.ts` / `actions.ts` per store. Declined, for two reasons.
Pinia setup stores are a single closure — state, getters and actions all close over the same
scope — so splitting them by role means threading `state` through every function as a
parameter and opening four files to follow one flow. And splitting by *technical role* is the
opposite of this codebase's organising idea, which is vertical slices.

The goal behind it was right, so it is served better: `useCollectionState<T>()` holds
`items` / `meta` / `status` / `error` plus every derived flag, and all three entity stores
compose it. That is the same separation, written once and reused three times rather than
copy-pasted three times — and adding a fourth entity gets it free.

**`useTable` no longer owns rows.** The real problem the request exposed: the composable held
`rows` and `meta`, and so would the store — the same page of server data in two places, free
to disagree. Now the store is the single source of truth for data and `useTable` is purely a
query-state engine (search, filters, sort, pagination, URL sync, debounce, cancellation).
This also gives the mandated Pinia layer real work instead of a parallel cache.

**Found while refactoring:** the batched setters ("change filter *and* reset to page 1") were
firing two requests, because Vue watchers flush asynchronously and a synchronous guard flag is
already cleared by the time they run. Requests are now issued explicitly from each setter
rather than by watching state — the one exception being `search`, which callers bind with
`v-model`, and which needs an internal-change flag so clearing filters does not re-arm the
debounce for a second redundant request.

## 2026-08-10 — `matchMedia` stub models a real viewport width

**Chose:** a test `matchMedia` that parses `(min-width: Npx)` and evaluates it against a
settable width, defaulting to desktop, with `setViewportWidth()` for narrower cases.
**Over:** the usual stub returning `matches: false` for every query.
**Because:** jsdom has no layout, so the naive stub reports "narrower than every breakpoint"
— which silently ran **every component test in the mobile layout**. It surfaced when the
data table's column-header assertions failed: the component was correctly rendering its card
list, and the desktop grid had no coverage at all. A stub that always answers the same way is
not a stub, it is a hard-coded branch.
**Costs:** the width is module state, reset in `afterEach`; a test that renders before calling
`setViewportWidth` gets the desktop default.
**Related:** the stub also has to be installed in `beforeEach`, not `beforeAll` —
`unstubGlobals` clears stubbed globals after every test, so an up-front stub survives exactly
one case and then vanishes.

## 2026-08-10 — No generic resource factory, and no per-feature `api.ts`

**Chose:** stores call `http` directly. `shared/api` is exactly two things — an axios client
with interceptors, and the `ApiError` contract — plus a shared `serialiseListQuery` helper.
**Over:** the `createResource<T, P>()` factory and per-feature `api.ts` modules that were
built first, and are now deleted.
**Because:** measured rather than assumed. Written out for the three entity slices, the
layered version was 12 lines of call sites plus a 50-line factory — **62 lines** — against
**25 lines** of direct `http` calls. The abstraction cost 2.5× what it saved. Break-even for
a generic CRUD factory is somewhere past five entities, and this application has three.
Worse, the factory had *zero consumers* when it was written: it was an abstraction built
before its first caller, which is the exact risk this project's own plan lists.

The per-feature `api.ts` was thinner still — for categories it was one line
(`export const categoriesApi = createResource(...)`) in its own file, behind its own import
hop, under a doc comment longer than the code.

**What we give up:** `encodeURIComponent` and query serialisation now appear once per entity
instead of once globally. The encoding is defensive anyway — ids are `cat_001`, not
user-supplied — and `serialiseListQuery` is still shared. A future generic wrapper (bulk
actions, optimistic updates) can be written against the store interface instead.
**What we keep, and why it does earn itself:** the client and error layer has 18+ call sites
and holds decisions that must not be re-made per call — base URL, token injection, timeout,
cancellation, the single 401 hook, and turning every failure mode into one `ApiError`. The
fetch→axios swap is the proof: one file changed, 22 tests passed untouched.
**Revisit if:** the entity count passes roughly five, or several resources need identical
cross-cutting behaviour wrapped around all five operations.

## 2026-08-10 — Correction: the phase 1 contrast finding was wrong

**What I claimed:** Aura's muted text (`surface.500`) fails WCAG AA at roughly 4.0:1.
**What is actually true:** computed properly, it is **4.76:1 on white and 4.55:1 on our
`surface.50` background** — both pass AA for normal text. The original figure was estimated by
eye from a screenshot, not calculated. There was no accessibility failure.
**What was done anyway:** muted text moved from `surface.500` to `surface.600` (7.24:1). Not
a fix — a margin decision. 4.55:1 clears the 4.5 threshold by 0.05, so any future adjustment
to the surface colour would drop it under with nobody noticing.
**The durable part:** `src/app/theme/contrast.spec.ts` now computes real WCAG ratios from the
literal hex values in `palette.ts` and asserts every text pairing in both colour schemes. The
palette is spelled out as hex rather than Aura `{slate.500}` references precisely so it can be
measured. The lesson generalises: an accessibility claim that isn't computed is a guess.

## 2026-08-10 — Money is stored as integer minor units

**Chose:** persist and transport prices as an integer count of the currency's minor unit
(`priceMinor: 4550`, `currency: 'EUR'`), converting to a major amount only for display and
form input, in `@/shared/utils/money`.
**Over:** a `price: number` float, which is what the brief's field list literally implies.
**Because:** floats cannot represent most decimal amounts exactly, and a ticketing platform
sums prices constantly — inventory value, revenue tiles, CSV exports. The bug is invisible
until totals are off by a cent.
**Costs:** the form has to convert both ways, and `priceMinor` is a less obvious field name
than `price`. Both are paid once, in one place.
**Note:** writing the tests for this caught a genuine bug in the first implementation.
`Math.round(1.005 * 100)` is 100, not 101, because `1.005 * 100` evaluates to
`100.49999999999999` — so the naive conversion silently lost a cent on exactly the inputs it
existed to protect. The fix shifts the decimal point on the number's string form instead.
**Revisit if:** a zero-decimal (JPY) or three-decimal (BHD) currency is added — the digit
table already exists for it, but the form's input mask would need to follow.

## 2026-08-10 — Architecture boundaries are lint rules with their own tests

**Chose:** encode the `app → features → shared` layering, feature isolation, the PrimeVue
containment and the "no `fetch` outside `shared/api`" rule as ESLint rules, then test the
rules themselves in `tests/architecture/boundaries.spec.ts` by writing deliberate violations
to disk and asserting each is rejected. The feature list is read from the filesystem at lint
time, so a new slice is covered the moment it exists.
**Over:** documenting the boundaries in the README and relying on review.
**Because:** the first version of the config was silently broken — the per-feature
`no-restricted-imports` block *replaced* the UI-kit restriction instead of adding to it
(flat config overwrites rule options rather than merging them), so any feature could have
imported PrimeVue directly with `pnpm lint` fully green. Nothing but an executable check
would have caught that, and nothing but a test would stop it regressing.
**Costs:** the architecture suite writes temporary files under `src/` and boots ESLint, so it
runs in about a second — slower than a normal unit test.
**Revisit if:** the rule set grows past what `no-restricted-imports` can express, at which
point a dedicated boundaries plugin earns its dependency.
