---
description: Quality gate — typecheck, lint, format, tests and production build must all pass
allowed-tools: Bash, Read, Edit, Glob, Grep
---

Run the full quality gate. This is the definition of "done" for any change.

Run these in order and report each result honestly:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Rules:

- **Fix what fails.** Do not report work complete with a red gate, and do not weaken a
  check to make it pass — no loosening `tsconfig`, no disabling a lint rule, no `.skip` on
  a failing test, no deleting an assertion. If a check is genuinely wrong, say so and
  explain why before changing it.
- A skipped or filtered test run is not a pass. Full suite, every time.
- If the build succeeds, report the bundle size of the main chunks and flag anything that
  looks unreasonable.
- Then re-read [docs/REQUIREMENTS.md](../../docs/REQUIREMENTS.md) and tick only the boxes
  you have actually verified in this run.

Finish with a short summary: what passed, what failed, what you changed to fix it, and
anything still outstanding. Do not pad it.
