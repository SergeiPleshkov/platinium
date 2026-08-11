# Audit skill rules

Shared contract for the **audit skills** in this repo — [`code-review`](../skills/code-review/SKILL.md)
and the design gate inside [`system-design`](../skills/system-design/SKILL.md). Each audit keeps
its own checklist, output filename, issue prefix and return strings. The persona, output
structure and loop protocol below are the same for all of them.

## Persona constraints

- **Hard facts only.** No opinions, no preferences, no "consider doing X".
- An issue is reportable only if it can cite **one** of:
  - a rule from a skill (e.g. `vue-feature SKILL §Module boundaries`),
  - a rule the build enforces (`eslint.config.js`, `tsconfig.base.json`, a test file),
  - a concrete file path and line where the violation occurs.
- If you cannot cite a source, you cannot raise the issue. Taste is not a citation.
- Do not re-litigate formatting. Prettier owns it.

## Output rules

- Write the verdict and findings to a single file under `plans/`. Overwrite any previous
  content on each cycle.
- **Verdict is `clean` only when there are zero blocking issues.** For audits that also run
  commands, every command must pass too. Non-blocking observations never affect the verdict.
- Each blocking issue carries all four fields:
  - **Location** — a path inside the artefact under review (`plans/system-design.md §Section`,
    or `src/features/tickets/store.ts:42`).
  - **Citation** — the skill rule, enforced rule, or path the issue is grounded in.
  - **Violation** — a fact: what the artefact does or omits that the rule forbids.
  - **Required correction** — an imperative the caller can apply mechanically. Not "consider
    extracting this", but "Move the `formatMoney` import at `src/features/events/EventRow.vue:8`
    from `@/features/tickets/utils` to `@/shared/utils/money`".
- Number issues sequentially with the audit's prefix (`CR-1`, `CR-2`, …).
- **No prose outside the structured sections.** A reader must be able to walk the issues
  mechanically.

## Loop protocol

Audits run at most **two cycles**. The caller passes a `cycle` counter and gets back one of
three return strings.

| Verdict | Cycle | Return |
|---|---|---|
| `clean` | any | `"<audit> clean (cycle N/2). Proceed to <next phase>."` |
| `issues-found` | 1 | `"<audit> found K blocking issues (cycle 1/2). Read plans/<file>.md, apply every Required correction, re-run validation, then re-invoke with cycle=2."` |
| `issues-found` | 2 | Escalate to the **user**: `"<audit> reached the cycle cap (2/2) with K remaining blocking issues. Review plans/<file>.md alongside the diff and decide whether to approve, fix manually, or revert."` |

**Never loop a third time.** An agent allowed to iterate on its own findings indefinitely
converges on something that satisfies the audit rather than something correct. The cap is what
puts a person back in the loop.

## Invocation

Callers dispatch audits as subagents (`Agent` with `subagent_type: general-purpose`) so the
audit's file reads and command runs stay out of the caller's context. The subagent needs write
access — its deliverable is the `plans/` file. Only the return string enters the caller's
window.

## `plans/` is ephemeral

Plan and audit files live in `plans/` at the repo root, are git-ignored, and are deleted once
the user has acknowledged the summary. The implementation is the deliverable; the planning
artefacts are scaffolding.
