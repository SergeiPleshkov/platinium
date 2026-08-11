---
description: Build one feature end to end. Plan, implement behind the right skill, verify, review, commit
argument-hint: <what to build, e.g. "venue management" or "saved filters">
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, Agent, TaskCreate, TaskUpdate, TaskList
---

Build: **$1**

This is the implementation phase. It sits between a plan and a review, and it does not skip
either.

## 1. Plan, unless it is genuinely small

If this change adds a layer, crosses a boundary, introduces a dependency, or touches more than
one feature slice, run the `system-design` skill first and come back with an approved
`plans/tasks.md`. The tell: if you cannot name every file you will touch before starting, you
need the plan.

A one-file change, a copy fix, an extra test case: carry on.

## 2. Orient

- Read [CLAUDE.md](../../CLAUDE.md) for the conventions and the command table.
- Load the skill that matches: `crud-entity` for an entity slice, `vue-feature` for
  components / composables / stores / API, `testing-vue` for tests.
- Read the layer README for anything you are about to touch: `src/shared/api/README.md`,
  `src/features/README.md`, `src/mocks/README.md`.
- **Find the nearest existing example and read it.** This codebase is deliberately repetitive
  across its three entity slices; matching them is usually right.

## 3. Check what already exists

Before adding a composable or a primitive, search `src/shared/`. There is a good chance the
building block is there:

- query state, view mode, virtual buffer → `useListView`
- collection state and optimistic updates → `useCollectionState`
- selection, bulk execution → `useRowSelection`, `useBulkAction`
- user-arranged order → `useSortableList`
- toasts → `useNotifications` (never a PrimeVue toast directly)
- roles → `usePermissions` / `ROLE_PERMISSIONS`

New abstractions need a third real consumer. Name them, or do not extract.

## 4. Implement

- Work in dependency order: `shared → mocks → features → app`.
- Respect the layering. Lint enforces it; do not work around it. A rule that is inconvenient
  usually means the thing belongs somewhere else.
- Run `pnpm typecheck` and `pnpm lint` continuously, not once at the end.
- Anything a user can do must be reachable by keyboard and announced to assistive tech.
- If the change is user-visible, run it in the browser and look at it. Tests passing is not the
  same as it working.
- A new or changed `shared/ui` primitive gets its `*.stories.ts` in the same commit, and you
  look at it in `pnpm storybook` before moving on. See `vue-feature SKILL §Every primitive
  ships with stories`.

## 5. Verify

Run `/verify`. Report each result honestly. A failing step is information, not an obstacle.

## 6. Review

Dispatch the `code-review` skill as a subagent over the diff. Apply every Required correction,
re-review at cycle 2 if it came back with issues, escalate to the user at the cap. Do not argue
with a finding that cites a rule; either fix it or change the rule deliberately.

## 7. Commit

- If a decision was non-obvious, or an obvious alternative was rejected, write it as a comment
  above the code it explains, or, if it is architecture-level, in the README of the layer it
  describes. Say what it cost.
- Delete the `plans/` files once the user has acknowledged the summary.
- Commit with a conventional-commit subject and a body explaining *why*, not what.
