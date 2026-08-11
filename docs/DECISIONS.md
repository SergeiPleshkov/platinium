# Architectural decisions

A summary of the decisions that shaped this codebase, grouped by the question each answers,
with the reasoning that would otherwise be lost. Where a decision cost something, the cost is
named. Where one was later reversed, it says so.

---

## 1 · Stack and dependencies

**Vue 3 + Vite + Pinia + Vue Router + TypeScript + Docker** are fixed by the brief. Everything
else was chosen against one test: *does this earn its place, and what does it cost to remove?*

**PrimeVue 4.5.5, pinned — not 5.x.** PrimeVue 5 is no longer open source: it carries the
PrimeTek dual licence, requires a licence key, ships an offline verifier as a runtime
dependency and may display a licence notice without one. 4.5.5 is the last MIT release.

**PrimeVue is a replaceable dependency, not the architecture.** It may only be imported inside
`src/shared/ui/**` and the app bootstrap; everything else consumes our own `Base*` components.
Tests query by role, label and visible text — never PrimeVue classnames — so the suite would
survive swapping the kit. The boundary has earned itself twice already: it caught a direct
PrimeVue import in a new dashboard component, and it forced `BaseButton` to stop leaking
PrimeVue's icon-only semantics, which had been clipping a labelled button to 40px.

**axios for transport, our own `ApiError` for the contract.** axios handles the plumbing;
`ApiError` with `fieldErrors` / `isValidation` / `isConflict` / `isRetryable` / `isAborted` is
application vocabulary. The evidence that the boundary sits in the right place: replacing a
hand-rolled `fetch` wrapper with axios changed one file — `http.ts` — and every test in the
layer passed unmodified. `src/shared/api/README.md` documents the layer in full.

**Our own zod ↔ vee-validate adapter, ~40 lines.** `@vee-validate/zod` peer-depends on zod 3
and reads Zod 3 internals — any schema using `.default()` throws at form setup. Forty lines
beat downgrading every schema to satisfy a dependency that cannot follow us forward.

**Two hand-written pieces that could have been dependencies**, both for the same reason — a
narrow requirement with enumerable correctness conditions:

- The **CSV reader** (`shared/utils/csv.ts`): quoted fields, delimiters and newlines inside
  quotes, doubled quotes, CRLF or LF, a leading BOM. A character scan, not a regex, because a
  field may contain every character that would otherwise be a boundary. What earns it is the
  pairing with the exporter — the tests round-trip writer through reader, so the BOM and CRLF
  the export deliberately writes cannot become an import that rejects every row.
- **`BaseSegmentedControl`**, rather than wrapping PrimeVue's `SelectButton`, which renders
  `aria-pressed` toggles — announcing as three independent buttons rather than one choice of
  three. A radio group needs roving tabindex and arrow keys; forty lines of correct semantics
  beat a wrapper fighting its wrapped component.

**Maximal TypeScript strictness**, including `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess`. Real friction, paid deliberately. Zero `any`, zero
`@ts-expect-error`, zero `eslint-disable` in the codebase.

---

## 2 · Module boundaries

```
app  →  features  →  shared
```

Enforced by ESLint, not by convention: a feature may not import another feature's internals
(only its public `index.ts`), may not import `app/`; `shared/` may not import either;
`primevue/*` only inside `shared/ui/**`; `axios` only inside `shared/api`; nothing outside
`shared/api` calls `fetch`.

**The rules are lint config with their own tests.** `tests/architecture/boundaries.spec.ts`
writes deliberate violations to disk, lints them, and asserts each is rejected — *and* asserts
that sanctioned dependencies still pass, so a rule tightened until everything is forbidden
cannot masquerade as a win. The feature list is read from the filesystem at lint time, so a new
slice is covered the moment it exists.

**This caught a real failure.** ESLint flat config *replaces* a rule's options when a later
entry configures the same rule — it does not merge them. The per-feature `no-restricted-imports`
config silently disabled the PrimeVue boundary while lint stayed green. Four of five deliberate
probes fired and one did not, which is how it was found. The boundary configs are now mutually
disjoint, each carrying an `ignores` that prevents it matching a file another one covers.

**A rule that is inconvenient once is usually evidence the thing being attempted belongs
somewhere else.** The dashboard once hardcoded route paths as string literals because the
boundary blocks `features → app`. That was working around the rule, and it gave up the
guarantee `RouteName` exists for — a renamed path would have kept the sidebar working while
silently 404ing. The nav was deleted; `PortalLayout` is the single source.

---

## 3 · Where state lives

| Concern | Owner |
|---|---|
| Server data (rows, buffer, meta, status, error) | the feature's Pinia store |
| Query state (search, filters, sort, page) | `useTable` |
| Rendering | `BaseDataTable` and the page |

**`useTable` deliberately owns no data.** An earlier version held `rows` and `meta`, and so did
the store — the same page of server state in two places, free to disagree. Splitting them
removes that class of bug and gives the mandated Pinia layer real work rather than a parallel
cache.

**`useCollectionState<T>()` is the state-and-getters layer, written once.** All three entity
stores compose it; a fourth entity gets `items` / `buffer` / `meta` / `status` / `error` and
every derived flag free.

**Requests fire explicitly, not from a watcher.** A watcher looks tidier but flushes
asynchronously, so "change the filter *and* reset to page 1" queues two runs — the first for a
query that was never valid — and no synchronous guard can suppress it, because the guard is
already cleared by the time the watcher runs.

**Preferences live where their subject lives.** Theme, sidebar collapse and render mode are
properties of *this screen* — a laptop at night and an office desktop reasonably differ — so
they stay in `localStorage`. A dashboard arrangement is a property of the person's judgement
about their own work and should meet them on a new machine, so it is saved against the account
via `PATCH /api/me/preferences`.

---

## 4 · Abstraction, measured rather than assumed

**No generic CRUD-resource factory.** Written out across three entities, the factory version
was 62 lines against 25 for direct calls — 2.5× what it saved — and it had *zero consumers*
when it was written. What survives is the `Resource<T, P>` interface, so cross-cutting
behaviour can still be written once.

**Per-feature `api.ts` modules were deleted on the same measurement, then reinstated at the
reviewer's direction — and the reinstatement was right.** Each has since grown endpoints that
are genuinely per-entity (`exportCsv`, `import`, `bulk`, `listCountries`), declared through the
`Resource<T, P> & { … }` intersection. The original measurement was honest about the present
and wrong about the future. The lesson kept is not "measure less" but that **a file is a
cheaper place to be wrong than an abstraction is**: deleting the factory cost nothing to
reverse; deleting the files cost a re-import in every store.

**What has since been extracted, and why each earned it:**

| Extraction | What earned it |
|---|---|
| `useListView` | Three pages needed the identical fifteen lines, *and* a non-obvious ordering (cancel → empty → load) that is easy to reintroduce wrongly by hand |
| `useCollectionState.optimistic` | Its failure mode is silent — forget the rollback and the screen confidently shows a rejected value with nothing looking broken |
| `useCollectionState.loadWindow` | The "only the first window sets status" rule is subtle, and three copies would drift |
| `useBulkAction` | The partial-success rule is wrong in *both* directions when written naively |
| `handleBulk` (mocks) | Same algorithm per entity; only "what does deleting one mean" varies |
| `asApiError`, `BaseBulkFailures`, `DragHandle` | Straight duplication, three copies each, found in the final audit |

Three copies of ten explicit lines is still preferred over an abstraction with one consumer.
`fetchList` and `fetchWindow` remain spelled out per store for that reason.

---

## 5 · The mock backend

One handler set runs in a Service Worker for the browser and in Node for Vitest, so tests
exercise the same request path the app does.

**It behaves like a real backend, not a fixture server.** It issues and checks auth tokens,
returns 422s with field-level errors, enforces referential integrity with 409s, maintains
denormalised counts, re-checks the permission matrix on every mutation, and supports forced
failures via an `x-mock-fail` header so error states are demonstrable rather than theoretical.

**Querying is server-side** — search → filter → sort → paginate, in that order, behind a
`{ data, meta }` envelope with `perPage` capped at 100. `tests/mock-api/querying.spec.ts`
proves it rather than assuming: pages are disjoint, walking all 25 pages yields exactly 250
distinct ids, and sorting picks the global extreme rather than the page's. That is the
difference between a UI that looks right at 250 rows and one that still works at 250,000.

Fixtures are deterministic — fixed seed, fixed ids, frozen clock — which is what lets tests
assert on specific rows and page boundaries.

---

## 6 · Correctness details that bit

**Money is integer minor units.** Writing the tests caught a real bug in the first
implementation: `Math.round(1.005 * 100)` is 100, not 101, because `1.005 * 100` evaluates to
`100.49999999999999`. The conversion now shifts the decimal on the string form.

**One display locale for every currency.** Formatting each currency in its own locale mixed
conventions on one screen — `1.234,56 €` beside `£1,234.56`. `en-GB` with
`currencyDisplay: 'narrowSymbol'` renders `$` rather than `US$`.

**Dates compare in local components, not UTC.** `formatDateRange` compared UTC days while
`Intl` formatted local, so a range could render as one day at some offsets. `TZ=UTC` is pinned
in `vitest.config.ts` so the suite cannot pass only on the author's machine.

**The `matchMedia` stub models a real viewport width.** A naive stub returning `matches: false`
for everything reports "narrower than every breakpoint" — every component test had been running
in the mobile layout, and the desktop grid had zero coverage while the suite stayed green.

**A correction worth keeping.** A phase-1 note claimed the muted-text contrast failed WCAG AA
at ≈4.0:1. That figure was an eyeball estimate and it was wrong: computed, it is 4.76:1 on
white and 4.55:1 on surface-50, both passing. The text was still darkened to `surface.600`
(7.24:1) for margin, and `contrast.spec.ts` now computes real ratios so no future claim rests
on an estimate.

---

## 7 · Tables: pagination and virtual scrolling

Both strategies ship, selectable from a switch on every list page, over the *identical*
server-side query. The interesting claim is not that either works — it is that neither changes
what the server is asked for.

**Virtual rows are written in place.** Replacing the buffer array changes its identity, and a
virtual scroller watches that reference to decide when to re-measure — so every arriving page
tore the grid down mid-scroll. Index writes stay reactive without moving the reference.

**Only the first window sets the collection's status.** Calling `beginLoad` per page put the
whole collection into `loading` on every scroll, flashing the skeleton over everything.

**Virtual mode lays out with `table-layout: fixed`.** Automatic layout measures the rows
currently in the DOM, and virtual scrolling keeps swapping those, so columns visibly jittered
as the user scrolled. The cost is that widths must be declared rather than discovered.

**Virtual mode is grid-only.** Below `md` the table renders cards whose height depends on their
content; forcing them to a fixed height to satisfy the scroller would let the technique dictate
the design. The switch is hidden there rather than offered and ignored.

Verified in a browser at 250 rows: the scroll surface reports 13,049px (250 × 52px), ~30 rows
exist in the DOM, scrolling to row 180 fetched pages 18–22, and six samples across a full
scroll produced one distinct set of column widths.

---

## 8 · Permissions

A `ROLE_PERMISSIONS` matrix in `features/auth/permissions.ts`, imported by the UI **and** by
the mock backend.

**Capabilities, not roles.** A button asking `can('delete')` keeps working when a fourth role
appears; one asking `role === 'admin'` has to be found and edited, and the ones nobody finds
are the bugs.

**Both sides, from one table.** Hiding a delete button stops an honest mistake and nothing
else — the request still succeeds from a console, from a stale tab whose role was downgraded,
or from a client bug. `requirePermission` re-checks server-side against the same import, and
the API tests make each forbidden call anyway, asserting both the 403 and that the database did
not change.

**403 is not 401.** The HTTP client's 401 hook ends the session; conflating the two would eject
a viewer from the application for clicking something they were not allowed to click.

**The matrix:** admin does everything; editor does everything but `delete`; viewer reads and
exports. That middle row is the one worth modelling — creating and correcting records is
routine back-office work, destroying one with sales against it is not. `export` is granted to
viewers because downloading changes nothing.

**Absence is explained.** A viewer gets a "Read only" badge, and the Actions *column*
disappears rather than becoming a header over an empty column.

---

## 9 · Bulk operations and import

**Bulk reports per record and is not transactional.** One request carries many ids, each
attempted independently: 207 with reasons when some are refused, 200 when none are. A
transaction is defensible for a real database and wrong here — it turns "three of these still
have tickets" into "nothing happened", leaving the admin to find the three by hand. Both codes
are 2xx because the operation *ran*; a 4xx would push the whole thing down an error path that
cannot report seven successes.

**Bulk is not a back door.** `action: 'delete'` requires the `delete` permission, so an editor
is refused exactly as they are on `DELETE /:id`.

**Selection holds ids, not records**, and is dropped when the query changes — ticking three
rows and then filtering would leave those ids selected but invisible. "Select all" means the
rows on screen, never the whole result set: the user cannot consent to what they cannot see.

**The import preview is a dry run of the commit, not a second validator.** Same endpoint, same
validation path, separated by a `dryRun` flag. Validating in the browser would be two
implementations of one rule, and could not answer the interesting questions ("is there an event
called this?") without downloading every event. Errors cite the file's *line number* including
the header, and name columns as the **file** spells them — the user is about to open this in a
spreadsheet, where `priceMinor` appears nowhere.

Valid rows import even when others fail, for the same reason bulk is not transactional.

---

## 10 · Optimistic updates

**Applied to exactly one action: the inline ticket status.** A frequent, low-risk, one-click
change where the user stays on the page and a 200ms round trip reads as lag.

**Deliberately not applied to the form dialogs**, which need the server's 422 to place
field-level errors on individual inputs — nor to the single delete, whose confirm dialog
explains a 409 ("still has 25 tickets") in place, which beats a row that vanishes and reappears.

**Restore the snapshot, not the inverse of the change.** Reconstructing "what it was" from the
delta stops being possible with more than one field, and is already wrong when the field was
already at the new value.

**Success is silent.** The row said so the moment it was clicked; confirming it afterwards is
noise. Only the failure speaks, and it prefers the server's message to the page's fallback.

---

## 11 · Accessibility

Treated as a correctness property, not a polish pass — several decisions were made *against*
the simpler implementation because of it.

**Drag and drop has a real keyboard path.** HTML5 DnD has no keyboard equivalent whatsoever, so
an arrangement offered only by dragging does not exist for keyboard and switch users. The
handle is a focusable `<button>` carrying its own position, and the arrow keys call the *same*
`moveTo` the drop does — not a fallback beside the real feature, the same feature reached
differently. Both axes work, because the grid reflows from four columns to one.

**Exactly one live region per announcement.** `BaseSpinner` is a live region on its own, but
nesting it inside a container that is also one announces the same wait twice. It grew a
`decorative` prop so the outer region wins; a test asserts `getAllByRole('status')` has length
one, because double-announcement is invisible in a screenshot and obvious to a screen reader.

**Composite widgets are labelled by `aria-labelledby`.** PrimeVue's `Select` and `DatePicker`
render a `<div>`/`<span>` root, so a `<label for>` associated with nothing. `BaseFormField`
distinguishes labellable controls from composite ones.

**Colour never carries meaning alone** — every badge's label states the status in words.

**Reordering is announced** by a polite live region, and stays *silent* when a move at the edge
was refused: announcing a move that did not happen is worse than announcing nothing.

---

## 12 · Loading and feedback

**Skeletons before first load, never a spinner over an empty grid.** `isInitialising`
distinguishes "loading with nothing to show" from "refreshing something already on screen".

**The indicator is the indicator and nothing else.** A "Loading rows…" banner over the virtual
grid was removed — the placeholder rows already mark which rows are arriving, exactly where
they will appear, at the row's own height, so nothing moves when the data lands. A card
containing a spinner *and* the words "Loading page…" was reduced to the spinner: the scrim, the
shape and the sentence said the same thing three times.

**The route overlay has a 150ms threshold.** Lazy route chunks mean a first visit fetches
JavaScript, and until it lands the router leaves the old page up — the click looks like it did
nothing. But a cached chunk resolves in milliseconds, and a spinner flashing on every click
reads as jank rather than feedback.

**The route tracker is deliberately not reference-counted.** A redirect is two navigations, and
a counter that missed one `afterEach` would strand the overlay over a page that will never
change. A single restarting timer cannot get stuck. `onError` is wired for the same reason.

---

## 13 · Delivery

**Multi-stage Docker → `nginxinc/nginx-unprivileged`**, non-root (uid 101, port 8080), SPA
fallback, gzip, immutable caching for hashed assets, `/healthz` driving the healthcheck.
~57 MB.

Two nginx traps hit and fixed: `add_header` is **not** inherited into a `location` that
declares its own, so the security headers were being served on nothing — they are now an
include pulled into every location. And `COPY a b /dest/` keeps both filenames, so the site
config landed as `conf.d/nginx.conf` beside the base image's `default.conf`, which kept
winning; every client-side route 404'd until it became two COPY lines.

**CI starts the container and curls it** — healthcheck, root, and a client-side deep link.
A build that succeeds is not evidence the image serves the app.

**Vendor chunks are left to the bundler, and that was measured.** Grouping PrimeVue, Vue, zod
and axios into hand-named chunks looked like the obvious caching win; built, it made the
dashboard's first load **276 kB gzipped instead of 207**, because naming a PrimeVue chunk drags
every route's components into it eagerly and undoes the route-level splitting. Reverted. The
size tripwire (`chunkSizeWarningLimit`) now sits at 700 kB, just above where the shared vendor
chunk legitimately lands — a warning that fires on every build is one nobody reads.

---

## 14 · Accepted debt

**Relation pickers load up to 200 options** and filter client-side. Correct at this size, wrong
past a few hundred events, where it would silently omit some. The clearest piece of intentional
debt here; the fix is a server-backed type-ahead.

**MSW ships in the production image** (~164 kB gzipped, lazy-imported behind an env flag),
because this application intentionally ships its own backend. Sessions live in memory, so a
page reload ends the session — handled correctly rather than hidden: the stored token is
validated on boot and discarded if the server no longer knows it.

**No E2E layer.** The integration tests drive the real router, real stores and real mock backend
in jsdom, covering the same journeys; Playwright would add real-browser fidelity and CI time.

**Drag ordering applies to dashboard widgets, not table rows.** A manual row order fights the
mandated sortable column headers — what a hand-placed row should do once the user sorts by
price is a product question nobody has answered, and inventing an answer would be worse than
leaving the tables alone.

**The view-mode switch is a demonstration control.** A production portal would pick one
rendering strategy per screen rather than hand the choice to the user. It is labelled "DEMO"
in the interface so that is not mistaken for a product decision.
