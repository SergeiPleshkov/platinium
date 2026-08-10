---
name: vue-feature
description: Architecture and authoring conventions for Vue 3 code in this repo — feature-module boundaries, component/composable/store split, shared UI primitives, API layer, error handling, accessibility and responsive rules. Use before writing or refactoring any .vue, composable, store or API file.
---

# Writing Vue in this repo

The reviewer is reading this codebase to judge architecture. Cheap wins — a leaked import
across features, business logic stuffed in a template, a bare `fetch` in a component —
cost more than a missing bonus feature.

## Module boundaries

```
app → features → shared
```

- `shared/` knows nothing about the domain. If a "shared" component mentions Events,
  Tickets or Categories, it belongs in a feature.
- A feature never reaches into another feature's files. If two features need the same
  thing, it moves to `shared/`. If a feature needs another feature's data, it goes through
  that feature's store via its public `index.ts`.
- `app/` wires everything: router, pinia, providers, global styles. No business logic.

## Where code goes

| Kind of code | Home |
|---|---|
| DOM, markup, styling | `.vue` component |
| Reusable stateful behaviour | composable |
| Server state, cross-view state | Pinia store |
| Pure transformation | `shared/utils` (fully unit-tested) |
| HTTP, error normalisation | `shared/api` + feature `api.ts` |

If a component's `<script setup>` grows past ~120 lines, behaviour is escaping into it —
extract a composable. If a composable touches `document` or component internals, it's
doing a component's job.

## Components

- `<script setup lang="ts">`, always. No Options API, no `defineComponent`.
- Typed props via `defineProps<Props>()` with an `interface Props`. Defaults via
  `withDefaults`. Typed emits via `defineEmits<{ ... }>()`.
- Props in, events out. A child never mutates a prop or writes to a store its parent owns —
  the exception is a feature's own page component, which is allowed to drive its store.
- Prefer `v-model` with `defineModel()` for two-way leaf inputs.
- `key` on every `v-for`, and it must be a stable id, never the index.
- No logic in templates beyond a comparison. Anything else is a `computed`.
- Slots over props for content injection; a primitive that takes a `label` string and also
  a `labelIcon` and also a `labelTooltip` should have taken a slot.

## Shared UI primitives (`shared/ui`)

`BaseButton`, `BaseInput`, `BaseSelect`, `BaseTextarea`, `BaseModal`, `BaseDataTable`,
`BasePagination`, `BaseBadge`, `BaseSkeleton`, `BaseEmptyState`, `BaseConfirmDialog`.

Rules for every primitive:
- Zero domain knowledge, zero store access, zero router access.
- Forwards `$attrs` to the meaningful root element (`inheritAttrs: false` where needed) so
  callers can pass `aria-*`, `data-testid`, `type`, etc.
- Variants via a typed `variant` / `size` prop, resolved through a lookup map — never a
  chain of ternaries in the template.
- Accessible by construction: labels tied to inputs, `aria-invalid` + `aria-describedby`
  on error, focus trap and `Esc` in modals, focus restored on close, visible focus ring.

## Composables

Named `useX`, return a plain object. Accept refs or getters, not raw values, when the input
can change. Clean up every listener, timer and observer in `onScopeDispose` — composables
must be safe to call outside a component.

The core ones this app leans on:

- `useTable` — search (debounced), filters, sort, pagination; two-way synced with the URL
  query, so any view is shareable and reload-safe.
- `useAsyncAction` — wraps an async call, exposes `{ run, pending, error }`, guarantees the
  pending flag unwinds on both paths.
- `useNotifications` — the only way to raise a toast.
- `useBreakpoint` — the one place `matchMedia` is read.

## API layer

- `shared/api/http.ts` — the single `fetch` wrapper. Base URL, JSON encode/decode, timeout,
  `AbortSignal`, auth header injection.
- `shared/api/errors.ts` — every failure becomes an `ApiError { status, message, fieldErrors? }`.
  Network failure, timeout, 4xx and 5xx all arrive at callers in that one shape.
- `shared/api/createResource.ts` — generic typed CRUD factory. Entities get their resource
  from it instead of hand-rolling five near-identical methods.

Nothing outside `shared/api` calls `fetch`.

## Error and loading discipline

Four states are mandatory for anything that loads: **loading**, **empty**, **error**,
**loaded**. A fifth for filtered lists: **no results for these filters**, with a way to
clear them. A spinner that can never be replaced by a real error message is a bug.

- Field-level validation → inline, next to the field.
- Failed action → toast, with the server's message when it's fit for a user.
- Failed page load → inline error block with a retry button, not a toast.
- Destructive actions → confirm dialog first, always.

## Responsive

Mobile-first Tailwind. Three breakpoints matter: 375 (mobile), 768 (tablet), 1280 (desktop).

- Data tables become stacked cards below `md`. Horizontal scrolling a table on a phone is
  not "responsive".
- Sidebar nav collapses to an off-canvas drawer below `lg`.
- Touch targets ≥ 44px. Dialogs go full-screen on mobile.

## Performance

- Lazy-load every route component.
- `shallowRef` for large immutable collections; `v-memo` only with a measurement to justify it.
- Debounce search input (300ms) and cancel the superseded request via `AbortSignal`.
- Keep an eye on bundle size — no date/util megalibrary for three formatting calls.

## Before you commit

- [ ] `pnpm typecheck` and `pnpm lint` clean
- [ ] No `any`, no unexplained suppression comments
- [ ] No cross-feature imports, no `fetch` outside `shared/api`
- [ ] Keyboard-reachable, labelled, focus-visible
- [ ] Works at 375px
