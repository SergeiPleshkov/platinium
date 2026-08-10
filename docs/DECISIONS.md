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
