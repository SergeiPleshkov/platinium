import { setup, type Preview } from '@storybook/vue3-vite'

import { installPrimeVue } from '@/app/plugins/primevue'

import '@/app/assets/main.css'
import './preview.css'

/**
 * Stories render through the application's own bootstrap.
 *
 * `installPrimeVue` is the same function `src/app/main.ts` calls, and `main.css` is the same
 * stylesheet, so a component here gets the real design tokens and the real cascade-layer
 * ordering. A Storybook configured with its own approximation of the theme is a second source
 * of truth, and the first thing it does is disagree with the app.
 */
setup((app) => {
  installPrimeVue(app)
})

/**
 * Dark mode is a class on `<html>`, driving Tailwind's `dark` variant and PrimeVue's
 * `darkModeSelector` together. The toolbar toggle sets the same class the app's theme
 * switch does, so a story cannot look right in one scheme and wrong in the other unnoticed.
 */
function applyScheme(scheme: string): void {
  document.documentElement.classList.toggle('dark', scheme === 'dark')

  /*
   * The page surfaces go on `<body>`, not on a wrapper around the story.
   *
   * A wrapper that stretches to fill the canvas also stretches inside a Docs page, where
   * every story is one block among many, so each one became a viewport-tall mostly-empty
   * box and the page read as blank. On the body the background fills the canvas in story
   * view and the blocks size to their content in docs view.
   *
   * Docs chrome (`.sbdocs-*`) still paints its own background — see `preview.css`.
   */
  document.body.classList.add('bg-surface-50', 'text-content', 'dark:bg-surface-950')
}

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: 'Colour scheme',
      toolbar: {
        title: 'Scheme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: { scheme: 'light' },

  decorators: [
    (story, context) => {
      applyScheme(String(context.globals['scheme']))
      // Padding only. The surfaces live on `<body>` so this stays compact inside a Docs page.
      return { components: { story }, template: '<div class="p-6"><story /></div>' }
    },
  ],

  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    /*
     * axe runs per story in the a11y panel, so a contrast or labelling regression in a
     * primitive is visible here before it reaches a page. `test: 'error'` only fails a build
     * under the Storybook test runner, which is not wired up yet, so today this is a fast
     * feedback loop rather than a gate. See TECHNICAL_REVIEW.md §6.
     */
    a11y: { test: 'error' },
    backgrounds: { disable: true },
  },
}

export default preview
