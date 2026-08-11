import type { StorybookConfig } from '@storybook/vue3-vite'

/**
 * Stories live beside the components they document, in `src/shared/ui/**`, and nowhere else.
 *
 * That glob is the policy, not a convenience: `shared/ui` is the layer with no domain
 * knowledge, so its components can be rendered from props alone. A story for a feature
 * component would need a store, a router and a mock backend, at which point it is an
 * integration test with a worse assertion model, and `tests/integration/` already owns that.
 */
const config: StorybookConfig = {
  stories: ['../src/shared/ui/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  typescript: {
    // Props tables are generated from the component's own TypeScript, so the docs
    // cannot drift from the interface the way a hand-written table would.
    check: false,
  },
}

export default config
