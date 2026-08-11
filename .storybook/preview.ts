import { setup, type Preview } from '@storybook/vue3-vite'

import { installPrimeVue } from '@/app/plugins/primevue'

import '@/app/assets/main.css'

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
      return {
        components: { story },
        // The same surfaces the app shell uses, so a component is judged against the
        // background it will actually sit on rather than a neutral white card.
        template:
          '<div class="min-h-dvh bg-surface-50 p-6 text-content dark:bg-surface-950"><story /></div>',
      }
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
