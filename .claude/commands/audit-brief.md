---
description: Audit the codebase against the assessment brief and report honest gaps before submission
allowed-tools: Bash, Read, Glob, Grep, Skill
---

Audit this repository against the assessment brief. Be the reviewer, not the author — the
goal is to find what's missing or weak while there's still time to fix it.

## Method

Go through [docs/REQUIREMENTS.md](../../docs/REQUIREMENTS.md) line by line. For each item,
find the **evidence in the code** — a file path, a component, a test — and classify it:

- **Done** — implemented and verified; name the file(s)
- **Partial** — exists but shallow (e.g. filtering that only works on one column); say what's missing
- **Missing** — not there

A ticked box with no evidence behind it is a Missing. Untick it.

## Then check the things the brief grades implicitly

- **Architecture** — is `app → features → shared` actually respected? Grep for cross-feature
  imports and for `fetch(` outside `shared/api`. Are there components doing store work, or
  stores doing DOM work?
- **Reuse** — how much duplication is there across the three entity slices? Some repetition
  is honest; three copy-pasted 300-line pages is not.
- **Tests** — does the suite actually assert behaviour, or does it assert that mocks were
  called? Would any of it catch a real regression? Pick two tests, break the code they
  cover, and confirm they fail.
- **Responsive** — check the table, forms, dialogs and nav at 375 / 768 / 1280.
- **States** — for each list and form: loading, empty, no-results, error, success. Find one
  that's missing.
- **Docs** — does `README.md` cover every bullet the brief lists? Does `TECHNICAL_REVIEW.md`
  answer all seven of its questions substantively, not with platitudes?
- **Repo hygiene** — legible commit history, no committed secrets, no stray build output,
  no dead scaffolding files, `.gitignore` correct, does a fresh `docker compose up` work.

## Output

A gap list ordered by how much it would cost you in review, each with the file to touch and
a rough size. Then say plainly whether this is submittable as it stands. Don't soften it.
