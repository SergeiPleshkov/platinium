import { describe, expect, it } from 'vitest'

import { eventSchema } from '@/features/events/schema'

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Summer Gala',
    country: 'FR',
    venue: 'Palais des Congrès',
    startDate: '2026-07-01T18:00:00.000Z',
    endDate: '2026-07-01T23:00:00.000Z',
    status: 'published',
    ...overrides,
  }
}

/** Asserts the schema rejects, and returns the message attached to `path`. */
function messageFor(input: Record<string, unknown>, path: string): string | undefined {
  const result = eventSchema.safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message
}

describe('eventSchema', () => {
  it('accepts a valid event', () => {
    expect(eventSchema.safeParse(validEvent()).success).toBe(true)
  })

  it('trims whitespace off text fields', () => {
    const result = eventSchema.parse(validEvent({ name: '  Summer Gala  ' }))
    expect(result.name).toBe('Summer Gala')
  })

  it.each([
    ['name', '', 'Enter an event name'],
    ['name', '   ', 'Enter an event name'],
    ['name', 'x'.repeat(121), 'Event name must be 120 characters or fewer'],
    ['country', '', 'Select a country'],
    ['venue', '', 'Enter a venue'],
    ['venue', 'x'.repeat(121), 'Venue must be 120 characters or fewer'],
  ])('rejects %s = %j with a usable message', (field, value, expected) => {
    expect(messageFor(validEvent({ [field]: value }), field)).toBe(expected)
  })

  it('rejects an unparseable date', () => {
    expect(messageFor(validEvent({ startDate: 'next tuesday' }), 'startDate')).toBe(
      'Enter a valid date',
    )
  })

  it('rejects a status outside the allowed set', () => {
    expect(messageFor(validEvent({ status: 'postponed' }), 'status')).toBe('Select a status')
  })

  describe('date range', () => {
    it('rejects an end date before the start date, reporting it on endDate', () => {
      const input = validEvent({
        startDate: '2026-07-10T10:00:00.000Z',
        endDate: '2026-07-01T10:00:00.000Z',
      })

      expect(messageFor(input, 'endDate')).toBe('The end date must be on or after the start date')
    })

    it('allows a single-instant event where start and end are equal', () => {
      const sameMoment = '2026-07-01T18:00:00.000Z'
      const input = validEvent({ startDate: sameMoment, endDate: sameMoment })

      expect(eventSchema.safeParse(input).success).toBe(true)
    })

    it('allows a multi-day range', () => {
      const input = validEvent({
        startDate: '2026-07-01T10:00:00.000Z',
        endDate: '2026-07-05T22:00:00.000Z',
      })

      expect(eventSchema.safeParse(input).success).toBe(true)
    })
  })
})
