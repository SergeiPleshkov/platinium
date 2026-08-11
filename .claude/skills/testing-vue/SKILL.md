---
name: testing-vue
description: Testing strategy and patterns for this repo — what to unit test vs integration test, Vitest + Testing Library + MSW setup, store/composable/component/flow patterns, and what not to test. Use when writing, fixing or reviewing any test file, or deciding test coverage for a feature.
---

# Testing

The brief asks for a *testing strategy*, not a coverage number. A strategy means: each kind
of test has a job, and no test duplicates another's job.

## The split

| Layer | Tool | Job |
|---|---|---|
| Utilities, schemas | Vitest | Pure input → output, edge cases |
| Composables | Vitest (+ `withSetup`) | Reactive behaviour in isolation |
| Stores | Vitest + MSW | State transitions across real request/response |
| Components | Testing Library | What the user sees and can do |
| Flows | Testing Library + router + MSW | Whole business journeys |
| Mock API | Vitest + plain `fetch` | The backend's own contract, without our client in the way |
| Architecture | Vitest + ESLint API | That the boundary rules still fire |

Unit tests are colocated (`Thing.spec.ts` next to `Thing.vue`). Integration tests live in
`tests/integration/`, endpoint contracts in `tests/mock-api/`, boundary probes in
`tests/architecture/`.

The architecture layer is worth understanding before touching `eslint.config.js`: it writes
deliberate violations to disk, lints them, and asserts each is rejected — **and** asserts that
sanctioned dependencies still pass, so a rule tightened until everything is forbidden cannot
masquerade as a win.

## Ground rules

- **Test behaviour, not implementation.** Query by role, label and text. `getByRole('button', { name: 'Create event' })`,
  not `find('[data-test=btn]')`. Reserve `data-testid` for things with no accessible handle.
- **Never mock what you can run.** MSW is the boundary. Do not stub Pinia stores, do not
  stub the API module, do not stub child components. If a test needs six mocks, the design
  is wrong — fix the design.
- **No `await nextTick()` chains.** Use `findBy*` / `waitFor`. If a test needs three ticks
  to pass, it is asserting on implementation timing.
- **Deterministic.** Fixed fixture ids, `vi.useFakeTimers()` for anything time-based, fixed
  clock for date formatting. No test may depend on execution order.
- **A test that can't fail is worse than no test.** Before trusting a new test, break the
  code and watch it go red.

## Setup

- `vitest.config.ts` — `environment: 'jsdom'`, globals on, setup file registers the MSW
  node server (`beforeAll listen` / `afterEach resetHandlers` / `afterAll close`), Testing
  Library auto-cleanup, and `@` → `src` aliasing shared with Vite.
- MSW handlers are the **same** handlers the browser uses. One mock backend, two runtimes.
  Per-test overrides via `server.use(...)`.
- `tests/utils/renderWithApp.tsx|ts` — mounts a component with a fresh Pinia, a real router
  and the global providers, returns Testing Library's queries plus the router. Every
  integration test starts here.
- Reset MSW's in-memory database between tests so state never leaks across specs.

## Traps this suite has already hit

Each of these cost real debugging time and is now guarded. Do not reintroduce them.

- **Mounting a layout component directly renders it twice.** The router still matches it at
  depth 0, so its own `<RouterView>` resolves to itself. Mount `App` instead — a fixture that
  manufactures the bug it is testing for is worse than no fixture.
- **The `matchMedia` stub models a real width** (`tests/utils/viewport.ts`, desktop by
  default). A stub returning `matches: false` for everything means every test silently runs in
  the mobile layout, and the desktop branch has no coverage while the suite is green.
- **`unstubGlobals` clears `beforeAll` stubs.** Global stubs go in `beforeEach` or they survive
  exactly one test.
- **`ResizeObserver` must be stubbed as a class**, not an arrow function — PrimeVue calls it
  with `new`, and the failure surfaces as an unrelated null `$el` several tests later.
- **Native `<option>` and PrimeVue's overlay share the `option` role.** Scope option queries to
  the open `listbox`, or a dropdown query matches a dozen table rows.
- **Resolve table columns through their headers**, never by `row.children[3]`. Adding a
  checkbox column shifted every index and broke two tests that were not about columns at all.
- **`role="status"` takes its accessible name from `aria-label`, not its content.** Query the
  text, or label the element.
- **The timezone is pinned to UTC** in `vitest.config.ts`, because a date test that passes only
  on the author's machine is worse than none.

## Patterns

### Schema
Valid payload passes. Each rule, one test, asserting the exact user-facing message. Boundary
values (empty string, whitespace-only, max length + 1, negative price, zero quantity).

### Store
```ts
const store = useEventsStore(createPinia())
await store.fetchList()
expect(store.items).toHaveLength(10)
expect(store.total).toBe(42)
```
Then the error path: `server.use(errorHandler(500))`, assert `status === 'error'` and that
`error` carries a usable message. Then create/update/delete: assert the collection reflects
the change, and that a failed mutation rethrows and leaves state consistent.

### Composable
```ts
const [result, app] = withSetup(() => useTable({ ... }))
result.setSearch('gala')
await vi.advanceTimersByTimeAsync(300)
expect(fetchSpy).toHaveBeenCalledOnce()  // debounced, not once per keystroke
app.unmount()
```

### Component
Render with real props. Assert rendered output and emitted events. For forms: fill via
`userEvent`, submit, assert the emitted payload; submit empty, assert the messages; make the
server return 422, assert the field error lands on the right field.

### Integration flow
Drive the app the way an admin would, through the router, against MSW:

1. **Auth** — visit a protected route unauthenticated → redirected to login; log in →
   land on the dashboard; reload → session persists; log out → back to login.
2. **Create** — open the entity page, click create, fill, submit → row appears, toast shown.
3. **Edit** — open the row, change a field, save → the change is visible in the table.
4. **Delete** — delete, confirm → row gone, toast shown; cancel → row stays.
5. **Search / filter / sort / paginate** — each changes the request and the rendered rows,
   and survives a reload via the URL query.
6. **Validation** — submit an invalid form → messages appear, nothing is sent.
7. **API failure** — force a 500 → error state with retry, no white screen, no lost input.

## Coverage

Meaningful over total. Non-negotiable: `shared/utils`, `shared/api`, every zod schema, every
store, `useTable` and `useAsyncAction`, and one integration flow per entity plus the auth
flow. Don't chase coverage on generated types, barrels or `main.ts`.

## Don't test

Vue itself, Pinia itself, the router itself, Tailwind classnames, or the exact wording of
copy in more than one place.
