// @vitest-environment node
// This suite shells out to ESLint and touches the filesystem; it has no use for a DOM.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Architecture tests.
 *
 * The module boundaries in CLAUDE.md are only real if something enforces them, and the
 * enforcement is only real if something proves it still works. This suite writes deliberate
 * violations to disk, lints them, and asserts each one is rejected.
 *
 * It exists because of a genuine near-miss: the per-feature `no-restricted-imports` block
 * silently replaced the UI-kit restriction rather than adding to it, so feature code could
 * import PrimeVue directly while `pnpm lint` stayed green. A rule that does not fire is not
 * a rule.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Probe features are created under src/features so the config's discovery picks them up. */
const PROBE_ALPHA = 'zz-probe-alpha'
const PROBE_BETA = 'zz-probe-beta'

interface Probe {
  description: string
  relativePath: string
  code: string
  expectedRule: string
  /** A distinctive phrase from the rule's message, so we assert the *right* rule fired. */
  expectedMessage: string
}

const probes: Probe[] = [
  {
    description: 'a feature importing PrimeVue directly',
    relativePath: `src/features/${PROBE_ALPHA}/probe-primevue.ts`,
    code: `import Button from 'primevue/button'\nexport const probe = Button\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'PrimeVue may only be imported from src/shared/ui',
  },
  {
    description: "a feature reaching into another feature's internals",
    relativePath: `src/features/${PROBE_ALPHA}/probe-cross-feature.ts`,
    code: `import { probeValue } from '@/features/${PROBE_BETA}/store'\nexport const probe = probeValue\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'must not reach into another feature',
  },
  {
    description: 'a feature depending on the app layer',
    relativePath: `src/features/${PROBE_ALPHA}/probe-app-import.ts`,
    code: `import { RouteName } from '@/app/router/routes'\nexport const probe = RouteName\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'features/ must not depend on app/',
  },
  {
    description: 'shared code depending on a feature',
    relativePath: 'src/shared/zz-probe-upward.ts',
    code: `import { probeValue } from '@/features/${PROBE_BETA}/store'\nexport const probe = probeValue\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'shared/ must not depend on features/',
  },
  {
    description: 'calling fetch outside the API layer',
    relativePath: 'src/shared/zz-probe-fetch.ts',
    code: `export function probe(): Promise<Response> {\n  return fetch('/api/events')\n}\n`,
    expectedRule: 'no-restricted-globals',
    expectedMessage: 'Use the typed client in @/shared/api',
  },
  {
    description: 'a feature importing axios directly',
    relativePath: `src/features/${PROBE_ALPHA}/probe-axios.ts`,
    code: `import axios from 'axios'\nexport const probe = axios\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'Import the typed client from @/shared/api instead of axios',
  },
  {
    description: 'shared (non-api) code importing axios',
    relativePath: 'src/shared/zz-probe-axios.ts',
    code: `import axios from 'axios'\nexport const probe = axios\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'Import the typed client from @/shared/api instead of axios',
  },
  {
    description: 'the UI layer importing axios',
    relativePath: 'src/shared/ui/zz-probe-axios.ts',
    code: `import axios from 'axios'\nexport const probe = axios\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'Import the typed client from @/shared/api instead of axios',
  },
  {
    description: 'the API layer importing PrimeVue',
    relativePath: 'src/shared/api/zz-probe-primevue.ts',
    code: `import Button from 'primevue/button'\nexport const probe = Button\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'PrimeVue may only be imported from src/shared/ui',
  },
  {
    description: 'the app layer importing axios',
    relativePath: 'src/app/zz-probe-axios.ts',
    code: `import axios from 'axios'\nexport const probe = axios\n`,
    expectedRule: 'no-restricted-imports',
    expectedMessage: 'Import the typed client from @/shared/api instead of axios',
  },
]

/**
 * The inverse assertions: each layer's *sanctioned* dependency must still be allowed.
 *
 * Without these, tightening a rule until everything is forbidden would look like a pass.
 */
const permitted: Array<{ description: string; relativePath: string; code: string }> = [
  {
    description: 'the API layer may import axios',
    relativePath: 'src/shared/api/zz-probe-allowed-axios.ts',
    code: `import axios from 'axios'\nexport const probe = axios\n`,
  },
  {
    description: 'the UI layer may import PrimeVue',
    relativePath: 'src/shared/ui/zz-probe-allowed-primevue.ts',
    code: `import Button from 'primevue/button'\nexport const probe = Button\n`,
  },
  {
    description: "a feature may import another feature's public barrel",
    relativePath: `src/features/${PROBE_ALPHA}/probe-allowed-barrel.ts`,
    code: `import { useEventsStore } from '@/features/events'\nexport const probe = useEventsStore\n`,
  },
  {
    description: 'a feature may import from shared',
    relativePath: `src/features/${PROBE_ALPHA}/probe-allowed-shared.ts`,
    code: `import { http } from '@/shared/api'\nexport const probe = http\n`,
  },
]

/** A support file the cross-feature probes import. Not itself a violation. */
const probeBetaStore = {
  relativePath: `src/features/${PROBE_BETA}/store.ts`,
  code: 'export const probeValue = 1\n',
}

function writeProbe(relativePath: string, code: string): string {
  const absolutePath = join(repoRoot, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, code, 'utf8')
  return absolutePath
}

let resultsByPath: Map<string, ESLint.LintResult>

beforeAll(async () => {
  writeProbe(probeBetaStore.relativePath, probeBetaStore.code)
  const paths = [...probes, ...permitted].map((probe) => writeProbe(probe.relativePath, probe.code))

  // A fresh instance so the config's filesystem-driven feature discovery sees the probes.
  const eslint = new ESLint({ cwd: repoRoot })
  const results = await eslint.lintFiles(paths)

  resultsByPath = new Map(results.map((result) => [result.filePath, result]))
}, 60_000)

afterAll(() => {
  rmSync(join(repoRoot, 'src/features', PROBE_ALPHA), { recursive: true, force: true })
  rmSync(join(repoRoot, 'src/features', PROBE_BETA), { recursive: true, force: true })

  for (const { relativePath } of [...probes, ...permitted]) {
    if (relativePath.includes(PROBE_ALPHA)) continue
    rmSync(join(repoRoot, relativePath), { force: true })
  }
})

describe('architectural boundaries are enforced by lint', () => {
  it.each(probes)('rejects $description', ({ relativePath, expectedRule, expectedMessage }) => {
    const result = resultsByPath.get(join(repoRoot, relativePath))
    expect(result, `no lint result for ${relativePath}`).toBeDefined()

    const messages = result!.messages.filter((message) => message.ruleId === expectedRule)

    expect(
      messages,
      `expected ${expectedRule} to fire on ${relativePath}, got: ${JSON.stringify(result!.messages.map((m) => m.ruleId))}`,
    ).not.toHaveLength(0)
    expect(messages.map((message) => message.message).join('\n')).toContain(expectedMessage)
    expect(messages.every((message) => message.severity === 2)).toBe(true)
  })

  it.each(permitted)('allows $description', ({ relativePath }) => {
    const result = resultsByPath.get(join(repoRoot, relativePath))
    expect(result, `no lint result for ${relativePath}`).toBeDefined()

    const boundaryViolations = result!.messages.filter(
      (message) =>
        message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-globals',
    )

    expect(
      boundaryViolations.map((message) => message.message),
      'a sanctioned dependency was rejected, the rules are too broad',
    ).toEqual([])
  })
})
