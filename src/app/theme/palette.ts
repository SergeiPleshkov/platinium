/**
 * The concrete colour values behind the theme.
 *
 * Spelled out as hex rather than referenced as `{slate.500}` so they can be asserted on:
 * `contrast.spec.ts` computes real WCAG ratios from these exact values. A token you cannot
 * measure is a token whose accessibility you are guessing at.
 */

export const BRAND = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b4b',
} as const

export const SURFACE = {
  0: '#ffffff',
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
} as const

/**
 * Foreground/background pairings the UI actually renders, and the minimum ratio each must
 * clear. These are the assertions in `contrast.spec.ts`.
 *
 * `surface.500` was the stock Aura muted colour. It passes AA on our light background, but
 * only at 4.55:1 — close enough to the 4.5 line that any future surface tweak would push it
 * under without anyone noticing. `surface.600` buys AAA-level headroom for one shade of
 * lightness, so the margin is deliberate rather than lucky.
 */
export const CONTRAST_REQUIREMENTS = [
  { name: 'body text on the light app background', fg: SURFACE[700], bg: SURFACE[50], min: 7 },
  { name: 'muted text on the light app background', fg: SURFACE[600], bg: SURFACE[50], min: 7 },
  { name: 'muted text on a light card', fg: SURFACE[600], bg: SURFACE[0], min: 7 },
  { name: 'body text on the dark app background', fg: SURFACE[100], bg: SURFACE[950], min: 7 },
  { name: 'muted text on the dark app background', fg: SURFACE[400], bg: SURFACE[900], min: 4.5 },
  { name: 'primary button label', fg: SURFACE[0], bg: BRAND[600], min: 4.5 },
  { name: 'brand text on light', fg: BRAND[600], bg: SURFACE[0], min: 4.5 },
  { name: 'brand text on dark', fg: BRAND[400], bg: SURFACE[900], min: 4.5 },
] as const
