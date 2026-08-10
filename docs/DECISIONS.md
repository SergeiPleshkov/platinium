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
