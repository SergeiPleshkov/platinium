---
name: system-design
description: Turn a requirement into a layered technical plan and then an unambiguous task list, with a design-review gate before the user is asked to approve. Use when asked for a plan, a technical design, a task breakdown, or before starting any change large enough to touch more than one layer.
---

# System design → plan → task list

Two outputs, in order:

1. **Implementation plan**: a layer-by-layer design, reviewed by an audit gate, then approved
   by the user.
2. **Task list**: produced only *after* the user approves the plan.

Nothing is built until the plan is approved. The failure mode this exists to prevent is not bad
code; it is efficiently building the wrong thing. A written plan is cheap to reject, a branch is
not.

## When to skip this

A one-file change, a copy fix, a test that needs an extra case: go straight to the work. This
skill is for changes that add a layer, cross a boundary, introduce a dependency, or touch more
than one feature slice. If you are unsure, the tell is whether you can name every file you will
touch before you start; if you cannot, run this.

## Read first

- [CLAUDE.md](../../../CLAUDE.md): non-negotiables and the command table.
- The [`vue-feature`](../vue-feature/SKILL.md) skill: module boundaries, where code goes, the
  composable inventory. **The plan is held to these rules**, so read them before writing it.
- [`crud-entity`](../crud-entity/SKILL.md) if the work adds or extends a domain entity.
- [`testing-vue`](../testing-vue/SKILL.md): the plan must say what gets tested and at which
  layer.
- The layer READMEs for anything the plan touches: [`src/shared/api/README.md`](../../../src/shared/api/README.md),
  [`src/features/README.md`](../../../src/features/README.md),
  [`src/mocks/README.md`](../../../src/mocks/README.md).

## Phase 1: codebase analysis

Mandatory, and dispatched to a subagent (`Agent` with `subagent_type: general-purpose`) so its
file reads stay out of this skill's context. The subagent writes `plans/codebase-analysis.md`
and returns only the path and a one-line status.

Facts only. **No recommendations**: this phase reports what is there; Phase 2 decides.

~~~markdown
# Codebase analysis: <title>

## TL;DR
<≤5 lines: scope, layers impacted, mandatory upstream changes, key forks needing a design call>

## Existing structure
- <path>: <one-line shape>

## Files to modify or integrate with
- [path](path) lines N-M: <role in this work>

## Contracts that constrain this
- `<TypeName>` from `<path>`: <one-clause constraint>

## Shared code to reuse instead of writing
- `<name>` from `<path>`: <one clause>
(Search `src/shared/composables` and `src/shared/ui` before concluding nothing fits.)

## Test patterns that apply
- <spec file>: <the pattern it demonstrates>

## Forks needing a design call
- **F-1** <name>: (a) <option>; (b) <option>. Trade-off: <one clause>.
~~~

## Phase 2: the plan

Write `plans/system-design.md`. Keep it under ~120 lines; do not restate facts that are already
in `plans/codebase-analysis.md`, link to them.

```markdown
# Implementation plan: <title>

**Facts**: `plans/codebase-analysis.md`

## TL;DR
<≤5 lines: scope, key decisions, what is explicitly out of scope>

## Layer impact
(Only affected layers. No empty headers saying "no changes".)

### shared/ (`src/shared/...`)
- <intent, one bullet per file or folder>
- <new public symbols by name; signatures go in the task list>

### features/<name>/
- <as above>

**Untouched**: <list>

## Data flow
<one paragraph, or a mermaid diagram only when ≥3 nodes are involved>

## Boundary check
- <each new cross-layer import>: allowed by `app → features → shared`? (yes/no; if no, the
  plan is wrong, redesign it)
- Does anything new import `primevue/*` outside `shared/ui`? (must be no)
- Does anything new call `fetch` or import axios outside `shared/api`? (must be no)

## State ownership
- <each new piece of state>: store | `useTable` | component-local, and why that owner

## Test plan
- <layer>: <what is asserted>, per `testing-vue SKILL §The split`

## Decisions and trade-offs
- **D-1**: <choice>. Rejected: <alternative>, because <one clause>.

## Open questions
- [ ] <anything needing an answer before tasks can be written>
```

### Plan quality rules

- Every entry references a real path, or says explicitly that a file is new.
- **No new abstraction without a third real consumer.** If the plan extracts a composable or a
  primitive, name the three call sites. Two is not enough; see `vue-feature SKILL §Composables`.
- No cross-feature imports. If the plan needs one, redesign it through `shared/` or the other
  feature's public `index.ts`.
- Every user-facing addition names its keyboard path and its accessible name. A control that a
  pointer can reach and a keyboard cannot is a defect, not a follow-up.
- Every loading surface names all four states: loading, empty, error, loaded.
- Anything that can be measured instead of argued, measure. "This is more reusable" is not a
  decision, it is a hope.

## Phase 2.5: design review (mandatory gate)

Before the user is asked to spend attention on the plan, it is fact-checked. Dispatch a subagent
(`Agent` with `subagent_type: general-purpose`) and tell it to:

1. Read [`.claude/rules/audit-skill.md`](../../rules/audit-skill.md) and follow it.
2. Read `plans/system-design.md`, this skill, and the `vue-feature` skill.
3. Check the plan against **Plan quality rules** above and the boundary rules, and write
   `plans/system-design-review.md` with issue prefix `SDR-`.
4. Return only the verdict string.

Cycle 1 → if `issues-found`, apply **every** Required correction mechanically and re-invoke at
cycle 2. Never a third cycle. If cycle 2 still has issues, take them to the user with the plan.

### Ask for approval

- Clean: *"Plan is at `plans/system-design.md` and passed design review. Review it and tell me
  when to proceed."*
- Cap reached: *"Plan is at `plans/system-design.md`. Design review hit the 2-cycle cap with K
  remaining issues; see `plans/system-design-review.md`. Approve as-is, or tell me which to
  fix."*

**Wait for approval.** Do not start Phase 3.

## Phase 3: the task list (after approval)

Write `plans/tasks.md`.

```markdown
# Tasks: <title>

**Scope**: <one sentence>

---

## Task 1: <verb> <object> in `<path>`

**File**: `<exact path>`
**Action**: create | modify | delete
**What to do**:
- <single unambiguous instruction>

**Contract** (when the shape is non-obvious):
\`\`\`ts
export interface Example { id: string }
\`\`\`

**Pattern reference**: follow `<Thing>` in `<path>` (lines N-M)

**Done when**:
- Given <precondition>, when <action>, then <observable result>
```

### Task writing rules

1. **One file per task.** Exception: a trivial type and its only consumer may share one.
2. **Verb-first titles**: Create, Add, Modify, Remove, Extract, Wire, Register.
3. **No vague language.** Not "handle errors properly" but "catch `ApiError` in `create()` and
   rethrow via `asApiError` so the dialog can place field errors".
4. **Concrete values only.** No `<as needed>`. Unknown becomes a blocking question.
5. **Pattern references are mandatory** for any task creating new code. This codebase is
   deliberately repetitive across its three slices; matching the nearest one is usually right.
6. **Dependency order.** Task N never depends on Task N+1. Order bottom-up:
   `shared → mocks → features → app`, and within a slice follow the nine layers in
   `crud-entity`.
7. **Tests are tasks**, not an afterthought appended to the last one.
8. **Blocking questions halt everything.** An incorrect task is worse than a missing one.
9. **≤30 lines per task.**

Then tell the user the list is ready, and after approval hand off to `/feature` (or execute the
tasks directly, in order, running `pnpm typecheck` and `pnpm lint` continuously).

## Cleanup

`plans/` is ephemeral and git-ignored. Delete the plan files once the user has acknowledged the
final summary. The implementation is the deliverable.
