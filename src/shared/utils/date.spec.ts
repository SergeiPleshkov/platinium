import { describe, expect, it } from 'vitest'

import { formatDate, formatDateRange, formatDateTime } from '@/shared/utils/date'

/** Intl separates date and time with a narrow no-break space; normalise before asserting. */
const NON_BREAKING = new RegExp('[' + String.fromCharCode(0x00a0, 0x202f) + ']', 'g')
const normalise = (value: string): string => value.replace(NON_BREAKING, ' ')

describe('date formatting', () => {
  describe('formatDate', () => {
    it('formats an ISO timestamp', () => {
      expect(normalise(formatDate('2026-07-01T18:00:00.000Z'))).toBe('01 Jul 2026')
    })

    it.each([
      [null, 'null'],
      [undefined, 'undefined'],
      ['', 'empty string'],
      ['not-a-date', 'unparseable'],
    ])('returns an em dash for %j (%s)', (input, _description) => {
      expect(formatDate(input)).toBe('—')
    })
  })

  describe('formatDateTime', () => {
    it('includes a 24-hour time', () => {
      expect(normalise(formatDateTime('2026-07-01T18:30:00.000Z'))).toMatch(
        /01 Jul 2026, \d{2}:\d{2}/,
      )
    })

    it('never renders a 12-hour meridiem', () => {
      expect(formatDateTime('2026-07-01T18:30:00.000Z')).not.toMatch(/am|pm/i)
    })
  })

  describe('formatDateRange', () => {
    it('collapses a same-day range to one date', () => {
      const result = formatDateRange('2026-07-01T10:00:00.000Z', '2026-07-01T23:00:00.000Z')
      expect(normalise(result)).toBe('01 Jul 2026')
    })

    it('shows both ends of a multi-day range', () => {
      const result = formatDateRange('2026-07-01T10:00:00.000Z', '2026-07-03T22:00:00.000Z')
      expect(normalise(result)).toBe('01 Jul 2026 – 03 Jul 2026')
    })

    it('falls back to the start when the end is unusable', () => {
      expect(normalise(formatDateRange('2026-07-01T10:00:00.000Z', 'nonsense'))).toBe('01 Jul 2026')
    })

    it('returns an em dash when the start is unusable', () => {
      expect(formatDateRange('nonsense', '2026-07-01T10:00:00.000Z')).toBe('—')
    })
  })
})
