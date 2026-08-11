import { afterEach, describe, expect, it } from 'vitest'

import { formatDate } from '@/shared/utils/date'
import { formatMoney } from '@/shared/utils/money'
import { resetAppLocale, setAppLocale } from '@/shared/utils/locale'

afterEach(() => {
  resetAppLocale()
})

describe('app locale', () => {
  it('defaults money and dates to en-GB', () => {
    expect(formatMoney(2550, 'EUR')).toMatch(/€25\.50/)
    expect(formatDate('2026-07-01T18:00:00.000Z')).toMatch(/01 Jul 2026/)
  })

  it('switches formatters when the app locale changes', () => {
    setAppLocale('de-DE')

    expect(formatMoney(2550, 'EUR')).toMatch(/25,50/)
    expect(formatDate('2026-07-01T18:00:00.000Z')).toMatch(/Juli|Jul/)
  })
})
