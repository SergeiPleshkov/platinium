---
name: code-review
description: Hard-facts audit of a diff against this repo's architecture, typing, testing and accessibility rules, with a validation run and mechanical corrections. Use before merging, when asked to review changes, or automatically after a feature or bug fix is implemented.
---

# Code review

Act as a seasoned reviewer performing a **fact-check** of a diff against this repository's own
rules. This is not a style critique and not a place for taste. Every issue cites a verifiable
source or it does not get raised.

**Read first**: [`.claude/rules/audit-skill.md`](../../rules/audit-skill.md): the persona
constraints, output structure and 2-cycle loop that govern every audit here. Only the
review-specific parts live in this file.

**Invocation**: run as a subagent (`Agent` with `subagent_type: general-purpose`) so the diff
scan and the validation commands stay out of the caller's context. The subagent needs write
access, since its deliverable is `plans/code-review.md`.

## Inputs

- **Changed files**: passed by the caller. If absent, fall back to
  `git diff --name-only $(git merge-base HEAD main)`.
- **Cycle counter**: `1` or `2`. Defaults to `1`.

If no changed files can be determined, stop and ask the caller for the list.

## Read before reviewing

- [`vue-feature`](../vue-feature/SKILL.md): the architecture the diff is held to.
- [`testing-vue`](../testing-vue/SKILL.md): what each kind of test is for, and the traps.
- [`crud-entity`](../crud-entity/SKILL.md): only if the diff touches an entity slice.
- [CLAUDE.md](../../../CLAUDE.md): the non-negotiables.
- The layer README for any layer the diff touches.

## Checklist

Each item is a check executed against the diff, not a general impression of it.

### 1. Module boundaries
Read every `import` in the changed files.

- A feature importing another feature's internals, meaning anything other than its
  `index.ts`. Blocking.
- A feature importing `@/app/**`. Blocking.
- `shared/` importing `@/features/**` or `@/app/**`. Blocking.
- `primevue/*` outside `src/shared/ui/**` and the app bootstrap. Blocking.
- `axios` or bare `fetch` outside `src/shared/api`. Blocking.

Lint catches all five. Run it (check 8), but read the imports anyway, because a rule that has
been narrowed is exactly the failure `tests/architecture/boundaries.spec.ts` exists to catch.

### 2. Type safety
- Any new `any`, `@ts-expect-error`, `@ts-ignore`, or `eslint-disable` without a comment naming
  the upstream constraint that forces it. Blocking. The repo's standing count of all four
  is zero.
- A cast (`as`) introduced to silence an error rather than to narrow a genuinely unknowable
  value. Blocking, cite the line.

### 3. Where the code went
Per `vue-feature SKILL §Where code goes`:

- Business logic in a `.vue` `<script setup>` past ~120 lines. Flag it with the line count.
- HTTP anywhere but a feature's `api.ts`.
- A "shared" file that names Events, Tickets or Categories. It belongs in a feature.
- A store owning DOM, toasts or the router.
- A new composable or primitive that duplicates something already in `src/shared/`: cite both
  paths.

### 4. Abstraction was earned
`vue-feature SKILL §Composables` sets the standard: extract on the **third** real consumer.

- A new abstraction with fewer than three call sites. Blocking unless the plan named why.
  Cite the call sites you found.

### 5. State ownership
- Server data held anywhere but the feature's Pinia store. Blocking.
- `useTable` (or anything composing it) holding rows. Blocking; it owns query state only.
- The same value derivable in two places and free to disagree. Cite both.

### 6. Error and loading discipline
Per `vue-feature SKILL §Error and loading discipline`:

- A new loading surface missing any of loading / empty / error / loaded. Blocking.
- A `catch` that swallows without surfacing. Blocking.
- A mutation that does not rethrow, or a list fetch that does. Blocking; the two rules are in
  `src/shared/api/README.md §How stores consume it`.
- A destructive action without a confirm step. Blocking.

### 7. Accessibility
Treated as correctness here, per `vue-feature SKILL §Accessibility`:

- A pointer interaction with no keyboard path. Blocking.
- An interactive element with no accessible name. Blocking.
- A second live region nested inside an existing one. Blocking (`BaseSpinner` takes
  `decorative` for this).
- Colour as the only carrier of meaning. Blocking.
- A new control below 44px on touch, or a table that scrolls sideways at 375px. Blocking.

### 8. Tests
- Non-trivial logic with no accompanying test: a composable with branches, a store action, a
  utility, a schema rule. Blocking. Pure presentational markup is exempt.
- A test querying by classname, `data-testid` where an accessible handle exists, or a PrimeVue
  internal. Blocking, per `testing-vue SKILL §Ground rules`.
- A stubbed store, API module or child component. Blocking. MSW is the only mock.
- An `await nextTick()` chain standing in for `findBy*` / `waitFor`. Blocking.
- A test that cannot fail: assertions satisfied by a skeleton row, a `toBeDefined()` on
  something that is always defined, an empty `expect` block. Blocking; this suite has shipped
  that bug before.

### 9. Stories
Per `vue-feature SKILL §Every primitive ships with stories`:

- A new component under `src/shared/ui/**` with no `*.stories.ts` beside it. Blocking.
- A new variant, size or state prop on an existing primitive with no story covering it.
  Blocking; the variants are the API, and an undocumented one is one nobody will find.
- A story outside `src/shared/ui/**`. Blocking, and say which layer it belongs in instead.
- A `meta` annotated with `Meta<...>`. Not blocking on its own, but flag it: it breaks on the
  generic components, and the repo keeps one pattern.

### 10. Validation run
Run all of these and record the result:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Any failure is blocking. Do not fix them here. Report them; fixing is the caller's job.

## Output: `plans/code-review.md`

```markdown
# Code review (cycle <N>/2)

**Verdict**: clean | issues-found

## Validation
- `pnpm typecheck`: pass | fail
- `pnpm lint`: pass | fail
- `pnpm format:check`: pass | fail
- `pnpm test`: pass | fail (<N failing>)
- `pnpm build`: pass | fail

## Blocking issues

### CR-1: <one-line summary>
- **File**: `<path>:<line>`
- **Citation**: `<skill> SKILL §<rule>` | `eslint.config.js` | `<path>`
- **Violation**: <fact. What the code does that the rule forbids.>
- **Required correction**: <imperative, tied to the path>

## Non-blocking observations

(Empty if none. Only included when they cite a rule.)
```

`clean` requires **both** zero blocking issues **and** all five commands passing.

## Return strings

Per [audit-skill.md §Loop protocol](../../rules/audit-skill.md):

- **clean** → `"Code review clean (cycle N/2). Proceed to the summary."`
- **issues-found, cycle 1** → `"Code review found K blocking issues (cycle 1/2). Read plans/code-review.md, apply every Required correction, re-run /verify, then re-invoke code-review with cycle=2."`
- **issues-found, cycle 2** → `"Code review reached the cycle cap (2/2) with K remaining blocking issues. Review plans/code-review.md alongside the diff and decide whether to approve, fix manually, or revert."`
