import { describe, expect, it } from 'vitest'

import {
  formatMoney,
  isCurrencyCode,
  parseMoney,
  toMajorUnits,
  toMinorUnits,
} from '@/shared/utils/money'

describe('money', () => {
  describe('unit conversion', () => {
    it('converts minor units to major', () => {
      expect(toMajorUnits(2550, 'EUR')).toBe(25.5)
      expect(toMajorUnits(0, 'USD')).toBe(0)
    })

    it('converts major units to minor, rounding to the nearest minor unit', () => {
      expect(toMinorUnits(25.5, 'EUR')).toBe(2550)
      expect(toMinorUnits(25.554, 'EUR')).toBe(2555)
      expect(toMinorUnits(25.555, 'EUR')).toBe(2556)
    })

    it('survives the float amounts that break naive money handling', () => {
      // 0.1 + 0.2 === 0.30000000000000004 as a float; as minor units it is exactly 30.
      expect(toMinorUnits(0.1, 'EUR') + toMinorUnits(0.2, 'EUR')).toBe(30)

      /*
       * The regression this module was written for: `1.005 * 100` is 100.49999999999999, so
       * multiply-then-round loses a cent. These three all round half-up correctly.
       */
      expect(toMinorUnits(1.005, 'USD')).toBe(101)
      expect(toMinorUnits(8.165, 'USD')).toBe(817)
      expect(toMinorUnits(1.115, 'USD')).toBe(112)
    })

    it('round-trips without drift across a large sum', () => {
      const total = Array.from({ length: 1000 }, () => toMinorUnits(19.99, 'EUR')).reduce(
        (sum, value) => sum + value,
        0,
      )

      expect(total).toBe(1_999_000)
      expect(toMajorUnits(total, 'EUR')).toBe(19_990)
    })
  })

  describe('formatMoney', () => {
    it('uses one number format for every currency, distinguished by symbol', () => {
      /*
       * Not each currency's home convention: side by side in a list, mixed separators make
       * the reader re-parse every row. Same separators, different symbol.
       */
      expect(formatMoney(2550, 'EUR')).toBe('€25.50')
      expect(formatMoney(2550, 'USD')).toBe('$25.50')
      expect(formatMoney(2550, 'GBP')).toBe('£25.50')
    })

    it('renders the plain symbol, not a currency-code prefix', () => {
      // en-GB would otherwise render USD as "US$25.50".
      expect(formatMoney(2550, 'USD')).not.toContain('US$')
    })

    it('groups thousands the same way in every currency', () => {
      expect(formatMoney(206157295, 'EUR')).toBe('€2,061,572.95')
      expect(formatMoney(206157295, 'GBP')).toBe('£2,061,572.95')
    })

    it('always shows the minor unit digits', () => {
      expect(formatMoney(2500, 'USD')).toBe('$25.00')
      expect(formatMoney(0, 'USD')).toBe('$0.00')
      expect(formatMoney(0, 'EUR')).toBe('€0.00')
    })
  })

  describe('parseMoney', () => {
    it('parses a plain decimal', () => {
      expect(parseMoney('25.50', 'EUR')).toBe(2550)
      expect(parseMoney('25', 'EUR')).toBe(2500)
      expect(parseMoney('0', 'EUR')).toBe(0)
    })

    it('parses dot-decimal with comma thousands separators', () => {
      expect(parseMoney('1,234.56', 'USD')).toBe(123_456)
    })

    it('parses comma-decimal with dot thousands separators', () => {
      expect(parseMoney('1.234,56', 'EUR')).toBe(123_456)
    })

    it('parses comma-decimal with space thousands separators', () => {
      expect(parseMoney('1 234,56', 'EUR')).toBe(123_456)
    })

    it('tolerates a currency symbol and surrounding whitespace', () => {
      expect(parseMoney('  €25,50 ', 'EUR')).toBe(2550)
      expect(parseMoney('$25.50', 'USD')).toBe(2550)
    })

    it.each([
      ['', 'empty'],
      ['   ', 'whitespace only'],
      ['abc', 'not a number'],
      ['-5', 'negative'],
      ['1.2.3', 'ambiguous separators'],
      ['12-34', 'stray hyphen'],
    ])('rejects %j (%s)', (input) => {
      expect(parseMoney(input, 'EUR')).toBeNull()
    })
  })

  describe('isCurrencyCode', () => {
    it('accepts supported codes and rejects everything else', () => {
      expect(isCurrencyCode('EUR')).toBe(true)
      expect(isCurrencyCode('JPY')).toBe(false)
      expect(isCurrencyCode(42)).toBe(false)
      expect(isCurrencyCode(null)).toBe(false)
    })
  })
})
