/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Implemented rather than pulled from a dependency because it is fifteen lines, and because
 * an accessibility assertion should not be able to drift with someone else's release.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

function channelToLinear(value: number): number {
  const normalised = value / 255
  return normalised <= 0.03928 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const normalised = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalised)) {
    throw new Error(`Expected a 6-digit hex colour, received "${hex}"`)
  }

  const red = Number.parseInt(normalised.slice(0, 2), 16)
  const green = Number.parseInt(normalised.slice(2, 4), 16)
  const blue = Number.parseInt(normalised.slice(4, 6), 16)

  return (
    0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue)
  )
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)

  return (lighter + 0.05) / (darker + 0.05)
}
