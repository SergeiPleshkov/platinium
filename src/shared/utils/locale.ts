/**
 * Display locale for money, dates and plain numbers.
 *
 * One locale for the whole UI, deliberately: mixing per-currency home locales in one table
 * makes readers switch number conventions between adjacent rows. The symbol distinguishes the
 * currency; separators are a property of the interface.
 *
 * Default preserves the historical `en-GB` output. Call `setAppLocale` from app bootstrap when
 * a signed-in preference exists; formatters read the live value so a change takes effect
 * without restarting every `Intl` instance that closed over a constant.
 */

export const DEFAULT_APP_LOCALE = 'en-GB'

let appLocale: string = DEFAULT_APP_LOCALE

export function getAppLocale(): string {
  return appLocale
}

export function setAppLocale(locale: string): void {
  appLocale = locale || DEFAULT_APP_LOCALE
}

/** Test helper: restore the default after specs that change the locale. */
export function resetAppLocale(): void {
  appLocale = DEFAULT_APP_LOCALE
}

/** Plain integer/decimal for counts and quantities — not money (see `formatMoney`). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getAppLocale()).format(value)
}
