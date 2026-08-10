import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

import { BRAND, SURFACE } from '@/app/theme/palette'

/**
 * The application design tokens.
 *
 * This preset is the single source of truth for brand and surface colour. PrimeVue emits it
 * as CSS custom properties (`--p-primary-500`, `--p-surface-100`, …), and Tailwind's `@theme`
 * block in `src/app/assets/main.css` aliases those same variables into utility classes. That
 * way a token is defined once and both systems agree, in light and dark mode alike.
 *
 * Values come from `palette.ts` as literal hex rather than Aura's `{slate.500}` references,
 * so `contrast.spec.ts` can compute real WCAG ratios against exactly what ships.
 */
export const AppThemePreset = definePreset(Aura, {
  semantic: {
    primary: BRAND,

    colorScheme: {
      light: {
        surface: SURFACE,
        primary: {
          color: BRAND[600],
          contrastColor: SURFACE[0],
          hoverColor: BRAND[700],
          activeColor: BRAND[800],
        },
        text: {
          color: SURFACE[700],
          hoverColor: SURFACE[800],
          /*
           * One shade darker than Aura's default (`surface.500`, 4.55:1 on our background).
           * That passes AA, but with almost no margin; `surface.600` is 7.2:1, which survives
           * a future surface tweak. Pinned by contrast.spec.ts.
           */
          mutedColor: SURFACE[600],
          hoverMutedColor: SURFACE[700],
        },
        content: {
          background: SURFACE[0],
          borderColor: SURFACE[200],
        },
        formField: {
          background: SURFACE[0],
          borderColor: SURFACE[300],
          placeholderColor: SURFACE[500],
        },
      },

      dark: {
        surface: SURFACE,
        primary: {
          color: BRAND[400],
          contrastColor: SURFACE[950],
          hoverColor: BRAND[300],
          activeColor: BRAND[200],
        },
        text: {
          color: SURFACE[100],
          hoverColor: SURFACE[0],
          mutedColor: SURFACE[400],
          hoverMutedColor: SURFACE[300],
        },
        content: {
          background: SURFACE[900],
          borderColor: SURFACE[700],
        },
        formField: {
          background: SURFACE[900],
          borderColor: SURFACE[700],
          placeholderColor: SURFACE[400],
        },
      },
    },
  },
})
