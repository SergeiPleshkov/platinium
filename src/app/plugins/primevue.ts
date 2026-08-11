import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import type { App } from 'vue'

import { AppThemePreset } from '@/app/theme/preset'

/**
 * PrimeVue registration. This and `src/shared/ui/**` are the only places allowed to import
 * from `primevue/*`, enforced by the `boundaries/ui-layer` ESLint rule.
 *
 * ToastService powers `BaseToaster`. Confirmations use our own `BaseConfirmDialog` (a
 * `BaseModal`), not PrimeVue's ConfirmationService — registering that service would add a
 * dead dependency and imply a pattern the kit does not follow.
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
}
