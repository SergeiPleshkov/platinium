# Mock API

A fake backend, built to behave like a real one. It is the only data source this application
has — there is no separate server — so it ships in the production image too.

## Why MSW

Handlers are written once and run in two places: a Service Worker in the browser, and a Node
server in Vitest. Tests therefore exercise **the same request handling the app does**, rather
than a parallel set of stubs that can drift. MirageJS or json-server would have meant two
implementations, or tests that never touch the real request path.

## Layout

```
mocks/
  fixtures/       seed data + a seeded PRNG (deterministic — see below)
  handlers/       one file per resource, plus index.ts composing them
  db.ts           in-memory store, id/timestamp ownership, derived counts
  query.ts        the search → filter → sort → paginate engine
  support.ts      latency, failure injection, auth, zod-backed validation
  config.ts       runtime knobs (latency, forced failures)
  browser.ts      Service Worker runtime (dev + production image)
  server.ts       Node runtime (Vitest)
```

## Endpoints

```
POST   /api/auth/login          → { token, user }
GET    /api/auth/me             → User            (401 without a valid token)
POST   /api/auth/logout         → 204             (idempotent)

GET    /api/categories          → { data, meta }
GET    /api/categories/:id
POST   /api/categories          → 201
PATCH  /api/categories/:id
DELETE /api/categories/:id      → 204, or 409 if tickets still reference it

GET    /api/events              → { data, meta }
GET    /api/events/countries    → string[]        (for the filter control)
GET    /api/events/:id
POST   /api/events              → 201
PATCH  /api/events/:id
DELETE /api/events/:id          → 204, or 409 if tickets still reference it

GET    /api/tickets             → { data, meta }  (event + category embedded)
GET    /api/tickets/:id
POST   /api/tickets             → 201             (422 if a relation does not exist)
PATCH  /api/tickets/:id
DELETE /api/tickets/:id         → 204
```

Every list endpoint accepts `search`, `sort`, `order`, `page`, `perPage` plus its own
filters, and returns `{ data, meta: { total, page, perPage, totalPages } }`.

## Things it does deliberately

**Querying is server-side.** Search, filtering, sorting and pagination all happen in the
handler, in that order. A response never contains more than `perPage` rows and `meta.total`
describes the *filtered* set. Returning whole collections would look identical in the UI and
would be the wrong answer to the brief's scaling question. `perPage` is capped at 100.

**Auth is mocked but enforced.** A token is issued, stored, checked on every entity request
and invalidated on logout — so the client's 401 handling and session restore are exercised
against real behaviour rather than assumed. Login returns the same message for an unknown
account and a wrong password, so the endpoint cannot be used to enumerate accounts.

**Validation uses the same zod schemas as the forms.** A 422 comes back as
`{ message, errors: { field: message } }`, which the client maps straight onto form fields.
A rule cannot be enforced in the form and forgotten on the server.

**Referential integrity is real.** Deleting an event or category that still has tickets
returns 409 with a message naming the obstacle, rather than cascading and silently destroying
inventory. Creating a ticket against a non-existent event returns a field-level 422.

**Derived counts are maintained centrally.** `ticketCount` on events and categories is
recomputed after every ticket mutation, so it cannot drift.

**Fixtures are deterministic.** A fixed seed, fixed ids and a frozen `SEED_NOW` mean two runs
produce identical data — which is what allows tests to assert on specific rows and page
boundaries. `Math.random()` anywhere in here would make the suite flaky.

## Credentials

| Email | Role |
|---|---|
| `admin@ticketing.test` | admin |
| `editor@ticketing.test` | editor |
| `viewer@ticketing.test` | viewer |

Password for all three: `password123`.

## Exercising latency and failures

Latency is 220 ms in the browser (so loading states are real) and 0 in tests (so the suite is
fast). Any request can be forced to fail with a header:

```
x-mock-fail: 500
```

Tests can also set it globally via `configureMocks({ forcedStatus: 500 })`. This is what makes
the error paths demonstrable instead of theoretical.

> Note for anyone benchmarking in an automated browser: headless/automation environments
> often clamp `setTimeout` to ~1 s, so a 220 ms configured latency can measure as ~1000 ms.
> That is the environment's timer resolution, not this code.
