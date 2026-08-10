import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import js from '@eslint/js'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettier from 'eslint-config-prettier/flat'
import pluginVue from 'eslint-plugin-vue'
import pluginA11y from 'eslint-plugin-vuejs-accessibility'

/**
 * Feature slices are discovered from the filesystem so the boundary rules below
 * stay correct as features are added, without anyone remembering to edit this file.
 */
const featuresDir = fileURLToPath(new URL('./src/features', import.meta.url))
const features = existsSync(featuresDir)
  ? readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

/**
 * PrimeVue is a replaceable dependency, not the architecture.
 *
 * It may only be imported by the `shared/ui` adapter layer and the app bootstrap.
 * Feature code consumes our own `Base*` components, so replacing PrimeVue with
 * in-house components later is a change confined to one directory.
 *
 * See docs/DECISIONS.md — "PrimeVue behind an in-house adapter layer".
 */
const uiKitRestriction = {
  group: ['primevue', 'primevue/*', '@primeuix/*', 'primeicons/*'],
  message:
    'PrimeVue may only be imported from src/shared/ui/** or the app bootstrap. ' +
    'Feature code must use the Base* wrappers in @/shared/ui so the UI kit stays swappable.',
}

/**
 * Axios is transport, not architecture.
 *
 * It may only be imported by `shared/api`, which wraps it and normalises every failure into
 * an `ApiError`. Callers elsewhere would bypass auth injection, timeout handling and the
 * central 401 hook — and would couple the whole app to one HTTP library.
 */
const httpClientRestriction = {
  group: ['axios', 'axios/*'],
  message:
    'Import the typed client from @/shared/api instead of axios directly, so every request ' +
    'gets consistent auth headers, cancellation and ApiError normalisation.',
}

/** Layering: app → features → shared. Arrows never point the other way. */
const layerRestrictions = {
  sharedImportingUpward: [
    {
      group: ['@/features/*', '@/features/**', '@/app/*', '@/app/**'],
      message:
        'shared/ must not depend on features/ or app/. Shared code is domain-agnostic — ' +
        'if it needs domain knowledge, it belongs in a feature.',
    },
  ],
  featureImportingApp: [
    {
      group: ['@/app/*', '@/app/**'],
      message:
        'features/ must not depend on app/. The app layer wires features together, not the reverse.',
    },
  ],
}

/**
 * Within `src/features/<name>/**`, every *other* feature is off limits.
 *
 * Note the repeated `uiKitRestriction`: flat config *replaces* a rule's options when a later
 * entry configures the same rule, it does not merge them. Omitting it here silently disabled
 * the UI-kit boundary for all feature code — caught by the deliberate-violation check that
 * phase 1 requires. Any future `no-restricted-imports` block matching these files must carry
 * the full pattern set for the same reason.
 */
const crossFeatureConfigs = features.map((feature) => ({
  name: `boundaries/feature-isolation-${feature}`,
  files: [`src/features/${feature}/**/*.{ts,vue}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          uiKitRestriction,
          httpClientRestriction,
          ...layerRestrictions.featureImportingApp,
          {
            group: features
              .filter((other) => other !== feature)
              .flatMap((other) => [`@/features/${other}/*`, `@/features/${other}/**`]),
            message:
              `The "${feature}" feature must not reach into another feature's internals. ` +
              "Go through that feature's public index.ts, or move the shared piece into @/shared.",
          },
          {
            // Relative paths that climb past the feature root are the same violation in disguise.
            group: ['../../../**'],
            message:
              'This relative import escapes the feature slice. Use the @/ alias so the ' +
              'boundary rules can see it.',
          },
        ],
      },
    ],
  },
}))

export default defineConfigWithVueTs(
  {
    name: 'app/ignores',
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.pnpm-store/**',
      'public/mockServiceWorker.js',
    ],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  pluginA11y.configs['flat/recommended'],
  vueTsConfigs.recommendedTypeChecked,

  {
    name: 'app/language-options',
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    name: 'app/rules',
    files: ['**/*.{ts,vue}'],
    rules: {
      /* Type safety is the point of using TypeScript; don't let it be opted out of quietly. */
      '@typescript-eslint/no-explicit-any': 'error',
      /*
       * The single source of truth for unused bindings (tsc's equivalents are off, since they
       * cannot be opted out of). A leading underscore marks something as intentionally unused
       * — required positional params, discarded destructured elements, ignored catch bindings.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      /* Vue conventions. */
      'vue/multi-word-component-names': 'error',
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-macros-order': [
        'error',
        { order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots'] },
      ],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/require-explicit-emits': 'error',
      'vue/no-v-html': 'error',
      'vue/prefer-true-attribute-shorthand': 'error',
      'vue/no-unused-refs': 'error',
      /*
       * Off by design. With `exactOptionalPropertyTypes`, a genuinely optional prop must not
       * be given an `undefined` default — the type system already expresses optionality, and
       * satisfying this rule would mean weakening the types.
       */
      'vue/require-default-prop': 'off',

      /* General hygiene. */
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },

  {
    name: 'boundaries/no-raw-fetch',
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/shared/api/**', 'src/mocks/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use the typed client in @/shared/api instead of calling fetch directly, so every ' +
            'request gets consistent error normalisation, auth headers and cancellation.',
        },
      ],
    },
  },

  /*
   * The `no-restricted-imports` configs below are deliberately **disjoint** — every one
   * carries an `ignores` that prevents it matching a file another one already covers.
   *
   * This is not stylistic. Flat config *replaces* a rule's options when a later entry
   * configures the same rule, it does not merge them, so two overlapping blocks silently
   * disable the earlier one's patterns. That exact bug shipped in phase 1 and left the
   * PrimeVue boundary unenforced while lint stayed green. Overlap is the hazard; disjointness
   * removes it. `tests/architecture/boundaries.spec.ts` proves each rule still fires.
   */

  {
    name: 'boundaries/api-layer',
    files: ['src/shared/api/**/*.ts'],
    rules: {
      // The one place axios is allowed; still may not reach upward or touch the UI kit.
      'no-restricted-imports': [
        'error',
        { patterns: [...layerRestrictions.sharedImportingUpward, uiKitRestriction] },
      ],
    },
  },

  {
    name: 'boundaries/ui-layer',
    files: ['src/shared/ui/**/*.{ts,vue}'],
    rules: {
      // The one place PrimeVue is allowed.
      'no-restricted-imports': [
        'error',
        { patterns: [...layerRestrictions.sharedImportingUpward, httpClientRestriction] },
      ],
    },
  },

  {
    name: 'boundaries/shared-is-domain-agnostic',
    files: ['src/shared/**/*.{ts,vue}'],
    ignores: ['src/shared/api/**', 'src/shared/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...layerRestrictions.sharedImportingUpward,
            uiKitRestriction,
            httpClientRestriction,
          ],
        },
      ],
    },
  },

  {
    name: 'boundaries/app-layer',
    files: ['src/app/**/*.{ts,vue}'],
    rules: {
      // The bootstrap registers PrimeVue, so it is exempt from that rule but not from this one.
      'no-restricted-imports': ['error', { patterns: [httpClientRestriction] }],
    },
  },

  {
    name: 'boundaries/mocks',
    files: ['src/mocks/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [uiKitRestriction, httpClientRestriction] }],
    },
  },

  ...crossFeatureConfigs,

  {
    name: 'app/tests',
    files: ['**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-restricted-imports': 'off',
    },
  },

  {
    name: 'app/config-files',
    files: ['*.config.{ts,js}', 'eslint.config.js'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  prettier,
)
