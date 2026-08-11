import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import type { App } from 'vue'

import { AppThemePreset } from '@/app/theme/preset'

/**
 * PrimeVue registration. This and `src/shared/ui/**` are the only places allowed to import
 * from `primevue/*`, enforced by the `boundaries/ui-kit-isolation` ESLint rule.
 */
export function installPrimeVue(app: App): void {
  app.use(PrimeVue, {
    ripple: false,
    theme: {
      preset: AppThemePreset,
      options: {
        // Matches the `dark` custom variant declared in main.css.
        darkModeSelector: '.dark',
        /*
         * Put PrimeVue's component styles in a named cascade layer ordered *before*
         * Tailwind's utilities. Without this, a Tailwind class on a PrimeVue component
         * silently loses the specificity fight and layout overrides mysteriously do nothing.
         */
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, components, primevue, utilities',
        },
      },
    },
  })

  app.use(ToastService)
  app.use(ConfirmationService)
}
