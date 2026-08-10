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
