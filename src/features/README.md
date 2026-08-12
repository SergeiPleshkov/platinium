# Features

One directory per feature slice. A slice owns everything about its domain and exposes a
deliberately small public surface.

```
features/<name>/
  index.ts        # the ONLY thing other layers may import from
  types.ts        # domain types
  schema.ts       # zod schemas, the single source of truth for validation
  api.ts          # Resource<T, P> endpoint module (CRUD slices)
  store.ts        # Pinia setup store: server state, loading/error flags, actions
  composables/    # feature-specific reactive behaviour
  components/     # feature-specific components (forms, dialogs, cells)
  pages/          # route-level components, lazy-loaded by the router
```

## Slice shapes

**CRUD entities** (events, categories, tickets) follow the nine layers in
`.claude/skills/crud-entity/SKILL.md`: types → schema → fixtures/handlers → `api.ts` → store →
UI. They share `useCollectionState`, list pages via `useEntityPage`, and form dialogs via
`useAsyncAction`.

**Auth** and **dashboard** are intentionally thinner:

- **Auth** inlines its HTTP calls in the store (an `api.ts` bought nothing) and owns
  session, preferences and the permissions matrix.
- **Dashboard** fetches a single `/stats` aggregate; there is no schema or collection state.

## Boundaries, enforced by lint

- A feature may import from `@/shared` freely.
- A feature may **not** import `@/app/**`. The app layer wires features together, not the
  reverse.
- A feature may **not** reach into another feature's internals. Cross-feature needs go
  through the other feature's `index.ts`, or the shared piece moves to `@/shared`.
- A feature may **not** import `primevue/*`. Use the `Base*` components from `@/shared/ui`,
  so replacing the UI kit stays a one-directory change.
- Nothing outside `@/shared/api` calls `fetch`.

These are `no-restricted-imports` / `no-restricted-globals` rules in `eslint.config.js`, and
`tests/architecture/boundaries.spec.ts` proves they still fire. The feature list is read from
this directory at lint time, so a new slice is covered the moment it exists.

## Adding one

Follow the nine layers in `.claude/skills/crud-entity/SKILL.md`, in order. Register the route
in `src/app/router/routes.ts` and the MSW handlers in `src/mocks/handlers/index.ts`.

The `api.ts` layer implements the shared `Resource<T, P>` contract.
[`src/shared/api/README.md`](../shared/api/README.md) has the template and the reasoning.
