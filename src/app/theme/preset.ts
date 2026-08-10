import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * The application design tokens.
 *
 * This preset is the single source of truth for brand and surface colour. PrimeVue emits it
 * as CSS custom properties (`--p-primary-500`, `--p-surface-100`, …), and Tailwind's `@theme`
 * block in `src/app/assets/main.css` aliases those same variables into utility classes. That
 * way a token is defined once and both systems agree, in light and dark mode alike.
 *
 * Consequence worth knowing: these values must stay CSS-variable-referenceable, so avoid
 * expressing a token as anything Tailwind can't consume through `var()`.
 */
export const AppThemePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
    // Slate reads as neutral in both schemes; zinc goes muddy against indigo in dark mode.
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '{slate.50}',
          100: '{slate.100}',
          200: '{slate.200}',
          300: '{slate.300}',
          400: '{slate.400}',
          500: '{slate.500}',
          600: '{slate.600}',
          700: '{slate.700}',
          800: '{slate.800}',
          900: '{slate.900}',
          950: '{slate.950}',
        },
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        content: {
          background: '#ffffff',
          borderColor: '{surface.200}',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '{slate.50}',
          100: '{slate.100}',
          200: '{slate.200}',
          300: '{slate.300}',
          400: '{slate.400}',
          500: '{slate.500}',
          600: '{slate.600}',
          700: '{slate.700}',
          800: '{slate.800}',
          900: '{slate.900}',
          950: '{slate.950}',
        },
        primary: {
          color: '{primary.400}',
          contrastColor: '{surface.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        content: {
          background: '{surface.900}',
          borderColor: '{surface.700}',
        },
      },
    },
  },
})
