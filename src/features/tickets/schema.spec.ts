import { describe, expect, it } from 'vitest'

import { ticketSchema } from '@/features/tickets/schema'

function validTicket(overrides: Record<string, unknown> = {}) {
  return {
    name: 'General Admission',
    priceMinor: 4500,
    currency: 'EUR',
    quantity: 500,
    status: 'on_sale',
    eventId: 'evt_001',
    categoryId: 'cat_001',
    ...overrides,
  }
}

function messageFor(input: Record<string, unknown>, path: string): string | undefined {
  const result = ticketSchema.safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message
}

describe('ticketSchema', () => {
  it('accepts a valid ticket', () => {
    expect(ticketSchema.safeParse(validTicket()).success).toBe(true)
  })

  it('accepts a free ticket priced at zero', () => {
    expect(ticketSchema.safeParse(validTicket({ priceMinor: 0 })).success).toBe(true)
  })

  it('accepts a sold-out ticket with zero remaining quantity', () => {
    const input = validTicket({ quantity: 0, status: 'sold_out' })
    expect(ticketSchema.safeParse(input).success).toBe(true)
  })

  it.each([
    ['name', '', 'Enter a ticket name'],
    ['name', 'x'.repeat(121), 'Ticket name must be 120 characters or fewer'],
    ['eventId', '', 'Select an event'],
    ['categoryId', '', 'Select a category'],
  ])('rejects %s = %j', (field, value, expected) => {
    expect(messageFor(validTicket({ [field]: value }), field)).toBe(expected)
  })

  describe('price', () => {
    it('rejects a negative price', () => {
      expect(messageFor(validTicket({ priceMinor: -1 }), 'priceMinor')).toBe(
        'Price cannot be negative',
      )
    })

    it('rejects a fractional minor unit — prices arrive already converted', () => {
      expect(messageFor(validTicket({ priceMinor: 45.5 }), 'priceMinor')).toBe(
        'Enter a price with at most two decimal places',
      )
    })

    it('rejects an implausibly large price, which is usually a misplaced decimal point', () => {
      expect(messageFor(validTicket({ priceMinor: 10_000_001 }), 'priceMinor')).toBe(
        'Price looks too high — check the decimal point',
      )
    })

    it('rejects a missing price rather than coercing it to zero', () => {
      expect(messageFor(validTicket({ priceMinor: undefined }), 'priceMinor')).toBe('Enter a price')
    })
  })

  describe('quantity', () => {
    it('rejects a fractional quantity', () => {
      expect(messageFor(validTicket({ quantity: 1.5 }), 'quantity')).toBe(
        'Quantity must be a whole number',
      )
    })

    it('rejects a negative quantity', () => {
      expect(messageFor(validTicket({ quantity: -5 }), 'quantity')).toBe(
        'Quantity cannot be negative',
      )
    })
  })

  describe('enums', () => {
    it('rejects an unsupported currency', () => {
      expect(messageFor(validTicket({ currency: 'JPY' }), 'currency')).toBe('Select a currency')
    })

    it('rejects an unknown status', () => {
      expect(messageFor(validTicket({ status: 'refunded' }), 'status')).toBe('Select a status')
    })
  })
})
