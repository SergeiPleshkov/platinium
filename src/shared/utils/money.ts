/**
 * Money handling.
 *
 * Amounts are stored and transported as integers in the currency's *minor* unit (cents,
 * pence). Floating-point majors are never persisted: `0.1 + 0.2` is the canonical reason, and
 * a ticketing system that sums thousands of prices will surface it. Conversion to a
 * human-readable major amount happens at the edges only, display and form input.
 */

export const CURRENCIES = ['EUR', 'USD', 'GBP'] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

/** Decimal places in each currency's minor unit. Not universally 2, JPY would be 0. */
const MINOR_UNIT_DIGITS: Record<CurrencyCode, number> = {
  EUR: 2,
  USD: 2,
  GBP: 2,
}

/**
 * One locale for every currency, deliberately.
 *
 * Formatting each currency in its *home* locale looks thoughtful in isolation and is wrong in
 * a list: `20.615.729,57 €` next to `£4,609,191.61` makes the reader switch number-format
 * conventions between adjacent rows, and the same ticket table showed `17,00 €` beside
 * `£97.99` in one column. Separators should be a property of the interface, not of the
 * amount; the symbol is what distinguishes the currency.
 *
 * This is the app's display locale. Making it follow the signed-in user is the next step
 * see TECHNICAL_REVIEW.md, and this constant is the single place it would come from.
 */
const APP_LOCALE = 'en-GB'

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}

function factorFor(currency: CurrencyCode): number {
  return 10 ** MINOR_UNIT_DIGITS[currency]
}

/** Minor units → major amount. `2550, 'EUR'` → `25.5`. */
export function toMajorUnits(minor: number, currency: CurrencyCode): number {
  return minor / factorFor(currency)
}

/**
 * Major amount → minor units, rounded half-up to the nearest whole minor unit.
 * `25.5` → `2550`.
 *
 * The decimal point is shifted on the number's *string* form rather than by multiplying.
 * Multiplying reintroduces exactly the error this module exists to avoid: `1.005 * 100` is
 * `100.49999999999999`, so a naive `Math.round` returns 100 and quietly loses a cent.
 * `Number('1.005e2')` is `100.5`, which rounds to the 101 an accountant would expect.
 */
export function toMinorUnits(major: number, currency: CurrencyCode): number {
  const digits = MINOR_UNIT_DIGITS[currency]
  const asString = String(major)

  // Values already in exponent form (1e-7) cannot take another suffix; they are far below
  // one minor unit anyway, so the ordinary path is exact enough.
  if (asString.includes('e') || asString.includes('E')) {
    return Math.round(major * factorFor(currency))
  }

  return Math.round(Number(`${asString}e${digits}`))
}

/**
 * Formats minor units for display: `2550, 'EUR'` → `€25.50`, `2550, 'USD'` → `$25.50`.
 *
 * One number format across every currency, see `APP_LOCALE`.
 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const digits = MINOR_UNIT_DIGITS[currency]

  return new Intl.NumberFormat(APP_LOCALE, {
    style: 'currency',
    currency,
    // `symbol` renders USD as "US$" in en-GB; `narrowSymbol` gives the plain $ £ €.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toMajorUnits(minor, currency))
}

/**
 * Parses user input into minor units. Accepts `1234.56`, `1,234.56` and `1 234,56`, since
 * admins paste amounts from spreadsheets in whatever locale they happen to use.
 *
 * Returns `null` for anything that is not a single unambiguous non-negative amount, the
 * caller decides what message to show, because only it knows the field name.
 */
export function parseMoney(input: string, currency: CurrencyCode): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  /*
   * Strip whitespace, including the no-break (U+00A0) and narrow no-break (U+202F)
   * spaces Intl emits as thousands separators, then drop currency symbols.
   */
  const cleaned = trimmed.replace(/[\s\u00A0\u202F]/g, '').replace(/[^\d.,-]/g, '')
  if (cleaned === '') return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalised: string
  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator: dots are thousands separators.
    normalised = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // Dot is the decimal separator: commas are thousands separators.
    normalised = cleaned.replace(/,/g, '')
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null

  const major = Number(normalised)
  if (!Number.isFinite(major) || major < 0) return null

  return toMinorUnits(major, currency)
}
