---
description: Build one feature end to end in this repo — orient, implement behind the right skill, verify, commit, record the decision
argument-hint: <what to build, e.g. "venue management" or "saved filters">
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, TaskCreate, TaskUpdate, TaskList
---

Build: **$1**

The phased plan this repo was built to is finished and deleted. This is the command for
everything after it.

## 1. Orient before writing

- Read [CLAUDE.md](../../CLAUDE.md) for conventions and the command table.
- Read the relevant section of [docs/DECISIONS.md](../../docs/DECISIONS.md). Several obvious
  implementations were tried and rejected here for reasons that are written down — check
  whether yours is one of them before spending the time.
- Load the skill that matches: `crud-entity` for an entity slice, `vue-feature` for
  components/composables/stores/API, `testing-vue` for tests.
- **Find the nearest existing example and read it.** This codebase is deliberately repetitive
  across its three entity slices; matching them is usually right.

## 2. Check what already exists

Before adding a composable or a primitive, search `src/shared/`. There is a good chance the
building block is there:

- query state, view mode, virtual buffer → `useListView`
- collection state and optimistic updates → `useCollectionState`
- selection, bulk execution → `useRowSelection`, `useBulkAction`
- user-arranged order → `useSortableList`
- toasts → `useNotifications` (never a PrimeVue toast directly)
- roles → `usePermissions` / `ROLE_PERMISSIONS`

## 3. Implement

- Respect the layering: `app → features → shared`. Lint enforces it; do not work around it.
  A rule that is inconvenient usually means the thing belongs somewhere else.
- Anything a user can do must be reachable by keyboard and announced to assistive tech.
- If the change is user-visible, run it in the browser and look at it. Tests passing is not
  the same as it working.

## 4. Verify

Run `/verify`. Report each result honestly — a failing step is information, not an obstacle.

## 5. Record and commit

- If a decision was non-obvious, or an obvious alternative was rejected, add it to the right
  section of `docs/DECISIONS.md`. Say what it cost.
- Update `docs/REQUIREMENTS.md` if this touched a listed requirement.
- Commit with a conventional-commit subject and a body explaining *why*, not what.
