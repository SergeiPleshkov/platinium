import { describe, expect, it } from 'vitest'

import { BRAND, CONTRAST_REQUIREMENTS, SURFACE } from '@/app/theme/palette'
import { contrastRatio } from '@tests/utils/contrast'

/**
 * Accessibility as an assertion rather than an intention.
 *
 * Colour-contrast regressions are invisible in review. A designer nudges a grey one step
 * lighter and nobody notices until an audit. These ratios are computed from the exact hex
 * values that ship, so a token change that breaks a pairing fails the build.
 */
describe('theme contrast', () => {
  it.each(CONTRAST_REQUIREMENTS)('gives $name at least $min:1', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
  })

  it('clears WCAG AA for every text pairing, in both colour schemes', () => {
    const failures = CONTRAST_REQUIREMENTS.filter(({ fg, bg }) => contrastRatio(fg, bg) < 4.5)
    expect(failures).toEqual([])
  })

  it('keeps muted text meaningfully clear of the AA threshold, not just over it', () => {
    /*
     * Aura's stock muted colour (surface.500) is 4.55:1 on our light background: passing, but
     * with 0.05 to spare. surface.600 is the deliberate replacement, see palette.ts.
     */
    expect(contrastRatio(SURFACE[500], SURFACE[50])).toBeLessThan(5)
    expect(contrastRatio(SURFACE[600], SURFACE[50])).toBeGreaterThan(7)
  })

  it('keeps the primary button legible in both directions', () => {
    expect(contrastRatio(SURFACE[0], BRAND[600])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(SURFACE[950], BRAND[400])).toBeGreaterThanOrEqual(4.5)
  })
})
