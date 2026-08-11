---
name: bug-fix
description: Reproduce, root-cause and fix a defect with a regression test written before the fix. Use when something is broken, misbehaving, or reported as not working — before changing any code to make it go away.
---

# Bug fix

Four phases, in order. The order is the point: a fix written before the reproduction is a guess,
and a guess that happens to work is indistinguishable from one that moved the symptom.

**A bug is not fixed until a test that failed for the right reason now passes.**

## Phase 1 — capture and reproduce

Write `plans/bug-report.md` as you go.

1. **State the symptom precisely.** Not "the table is broken" but "at 375px on /tickets the
   header row scrolls horizontally past the viewport". Include the route, the role signed in,
   the viewport, and the data conditions.
2. **Reproduce it.** In the browser via the preview tools, or as a failing test. If you cannot
   reproduce it, stop and say so — do not fix a report you cannot observe. Ask for the missing
   condition.
3. **Record the smallest reproduction** you found. This becomes the regression test's setup.

```markdown
# Bug: <one line>

## Symptom
<observable behaviour, with route / role / viewport / data>

## Expected
<what should happen instead>

## Reproduction
1. <step>
2. <step>
→ <observed>

## Environment
<browser | vitest | docker image; anything conditional>
```

## Phase 2 — root cause

Find the line, not the layer. Append to `plans/bug-report.md`:

```markdown
## Root cause
**File**: `<path>:<line>`
**Mechanism**: <why this code produces the symptom, in one paragraph>
**Introduced by**: <commit or "unknown">
```

Rules:

- **Do not stop at the first plausible explanation.** Confirm it: change the suspect line, watch
  the symptom move. An unconfirmed root cause is a hypothesis.
- **Trace to the real owner.** A symptom in a page is often a defect in a composable, and a
  defect in a composable is often a contract that was never stated. Fixing the page hides it.
- **Check whether the class of bug exists elsewhere.** Three slices share a shape here; a bug in
  one is usually a bug in three. Grep before fixing.

### Triage

| The cause is | Do this |
|---|---|
| a wrong line, contained | continue to Phase 3 |
| a missing or wrong contract between layers | run the `system-design` skill first, then come back |
| the code is correct and the expectation was wrong | say so, close the report, do not change code |
| an accepted trade-off already documented | point at `TECHNICAL_REVIEW.md §3` and confirm with the user before changing it |

## Phase 3 — red, then green

**Write the failing test first.** No exceptions, and no writing it after the fix "to confirm".

1. Add the test at the layer the root cause lives at — per
   [`testing-vue`](../testing-vue/SKILL.md): a utility bug gets a unit test, a store bug gets a
   store test against MSW, a whole-journey bug gets an integration test.
2. **Run it and watch it fail.** Read the failure message. If it fails for a different reason
   than the bug, the test is wrong — fix the test before touching the source.
3. Now fix the source.
4. Run the test again. Green.
5. Run the **full suite**. A fix that breaks two other tests is not a fix.

Test rules that apply specifically here:

- Assert the **user-visible** outcome, not the internal state that happened to be wrong. Query
  by role, label and text.
- The test must be specific enough to fail if the bug returns and no more. A test asserting the
  whole page renders does not guard a column width.
- No `data-testid` where an accessible handle exists.

## Phase 4 — verify and review

1. Run `/verify` — the whole gate, not just the new test.
2. If the bug was user-visible, **look at it in the browser**. Several defects in this codebase
   passed typecheck, lint and the full suite and were only visible in a running app.
3. Dispatch [`code-review`](../code-review/SKILL.md) as a subagent over the diff.
4. Apply every Required correction, re-review at cycle 2 if needed, escalate at the cap.

## Phase 5 — close

- Append the fix to `plans/bug-report.md`, then delete the file once the user acknowledges.
- Commit with `fix(<scope>): <what now works>`, and a body explaining the **mechanism** — the
  next person to read the history wants to know why it broke, not that it was fixed.
- If the bug came from a gap in the rules rather than a slip, put it in the relevant skill.
  `testing-vue SKILL §Traps this suite has already hit` exists for exactly this. A finding that
  repeats belongs in a skill, not in another review.
