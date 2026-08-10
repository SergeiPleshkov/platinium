---
description: Execute one phase of docs/PLAN.md end to end — build, verify, commit, log decisions
argument-hint: <phase number, e.g. 4>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, TaskCreate, TaskUpdate, TaskList
---

Execute phase **$1** of [docs/PLAN.md](../../docs/PLAN.md).

## 1. Orient

- Read the phase's section in `docs/PLAN.md`: its scope, its deliverables, its exit criteria.
- Read [CLAUDE.md](../../CLAUDE.md) for conventions.
- Load the skill that matches the work: `crud-entity` for an entity slice, `vue-feature`
  for components/composables/stores/API, `testing-vue` for tests.
- Check the phase's assumptions still hold against the code as it actually is now. If the
  plan has drifted from reality, say so before you start writing.

## 2. Build

- Break the phase into tasks and track them, so progress is visible.
- Work in the plan's order — later steps in a phase generally depend on earlier ones.
- Write the tests for a unit as you finish it, not in a batch at the end.
- Stay inside the phase's scope. If you spot something worth doing that belongs to another
  phase, note it and move on — don't silently widen the phase.

## 3. Verify

Run `/verify`. Everything green, no exceptions. Then confirm the phase's own exit criteria
from the plan, one by one.

## 4. Record

- Tick the boxes in `docs/REQUIREMENTS.md` that this phase genuinely satisfies.
- Append any decision, trade-off or accepted debt to `docs/DECISIONS.md` — one short entry:
  what was decided, what the alternative was, why. `TECHNICAL_REVIEW.md` gets assembled
  from these later, so write them while the reasoning is fresh.
- Commit with a conventional-commit subject scoped to the phase
  (e.g. `feat(events): CRUD slice with server-side table`). Group logically related work
  into separate commits rather than one dump.

## 5. Report

Tell me: what landed, what the gate said, what you decided and why, anything deferred, and
what phase **${1}+1** starts with. Keep it brief and truthful — if something is half-done,
name it.
