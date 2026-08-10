# Features

One directory per feature slice. A slice owns everything about its domain and exposes a
deliberately small public surface.

```
features/<name>/
  index.ts        # the ONLY thing other layers may import from
  types.ts        # domain types
  schema.ts       # zod schemas — the single source of truth for validation
  api.ts          # resource built on @/shared/api, never bare fetch
  store.ts        # Pinia setup store: server state, query state, loading/error flags
  composables/    # feature-specific reactive behaviour
  components/     # feature-specific components (forms, dialogs, cells)
  pages/          # route-level components, lazy-loaded by the router
```

## Boundaries, enforced by lint

- A feature may import from `@/shared` freely.
- A feature may **not** import `@/app/**` — the app layer wires features together, not the
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
