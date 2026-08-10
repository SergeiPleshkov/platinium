import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useTicketsStore } from '@/features/tickets/store'
import { db } from '@/mocks/db'
import { configureHttp, resetHttpConfig, type ApiError } from '@/shared/api'
import { createListQuery } from '@/shared/types/api'
import { signIn } from '@tests/utils/apiClient'

const ORIGIN = window.location.origin

let store: ReturnType<typeof useTicketsStore>

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Store Test Tier',
    priceMinor: 4500,
    currency: 'EUR' as const,
    quantity: 100,
    status: 'on_sale' as const,
    eventId: db.events[0]!.id,
    categoryId: db.categories[0]!.id,
    ...overrides,
  }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  const token = await signIn()
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => token })
  store = useTicketsStore()
})

afterEach(() => {
  resetHttpConfig()
})

describe('tickets store', () => {
  it('loads a page of 250 tickets without shipping them all', async () => {
    await store.fetchList(createListQuery({ perPage: 10 }))

    expect(store.items).toHaveLength(10)
    expect(store.meta.total).toBe(250)
    expect(store.meta.totalPages).toBe(25)
  })

  it('embeds event and category names so no id reaches the screen', async () => {
    await store.fetchList(createListQuery({ perPage: 5 }))

    for (const ticket of store.items) {
      expect(ticket.event.name).toBeTruthy()
      expect(ticket.category.name).toBeTruthy()
      expect(ticket.event.id).toBe(ticket.eventId)
    }
  })

  describe('filters', () => {
    it('filters by event', async () => {
      const event = db.events[0]!
      await store.fetchList(createListQuery({ perPage: 100, filters: { eventId: event.id } }))

      expect(store.items.length).toBeGreaterThan(0)
      expect(store.items.every((ticket) => ticket.eventId === event.id)).toBe(true)
      expect(store.meta.total).toBe(event.ticketCount)
    })

    it('filters by category', async () => {
      const category = db.categories.find((candidate) => candidate.ticketCount > 0)!
      await store.fetchList(createListQuery({ perPage: 100, filters: { categoryId: category.id } }))

      expect(store.items.every((ticket) => ticket.categoryId === category.id)).toBe(true)
    })

    it('filters by status', async () => {
      await store.fetchList(createListQuery({ perPage: 100, filters: { status: 'sold_out' } }))

      expect(store.items.every((ticket) => ticket.status === 'sold_out')).toBe(true)
    })

    it('combines an event filter with a status filter', async () => {
      const event = db.events[0]!
      await store.fetchList(
        createListQuery({ perPage: 100, filters: { eventId: event.id, status: 'on_sale' } }),
      )

      expect(
        store.items.every((ticket) => ticket.eventId === event.id && ticket.status === 'on_sale'),
      ).toBe(true)
    })

    it('applies a price range', async () => {
      await store.fetchList(
        createListQuery({ perPage: 100, filters: { minPrice: '5000', maxPrice: '10000' } }),
      )

      expect(store.items.length).toBeGreaterThan(0)
      expect(
        store.items.every((ticket) => ticket.priceMinor >= 5000 && ticket.priceMinor <= 10_000),
      ).toBe(true)
    })
  })

  it('sorts by price across the whole collection, not the page', async () => {
    await store.fetchList(createListQuery({ sort: 'priceMinor', order: 'asc', perPage: 1 }))

    const cheapest = Math.min(...db.tickets.map((ticket) => ticket.priceMinor))
    expect(store.items[0]?.priceMinor).toBe(cheapest)
  })

  it('searches through the embedded event name', async () => {
    const event = db.events[0]!
    await store.fetchList(createListQuery({ search: event.name, perPage: 100 }))

    expect(store.items.length).toBeGreaterThan(0)
    expect(store.items.every((ticket) => ticket.event.name === event.name)).toBe(true)
  })

  describe('page value', () => {
    it('totals the loaded page per currency', async () => {
      await store.fetchList(createListQuery({ perPage: 10 }))

      const expected: Record<string, number> = {}
      for (const ticket of store.items) {
        expected[ticket.currency] =
          (expected[ticket.currency] ?? 0) + ticket.priceMinor * ticket.quantity
      }

      expect(store.pageValueByCurrency).toEqual(expected)
    })

    it('never mixes currencies into one number', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))

      // Adding EUR to GBP would be arithmetically valid and completely wrong.
      expect(Object.keys(store.pageValueByCurrency).length).toBeGreaterThan(1)
    })
  })

  describe('mutations', () => {
    it('creates a ticket and returns it with relations resolved', async () => {
      const created = await store.create(validPayload())

      expect(created.id).toMatch(/^tkt_\d+$/)
      expect(created.event.name).toBe(db.events[0]!.name)
    })

    it('rejects a ticket pointing at an event that no longer exists', async () => {
      const error = (await store
        .create(validPayload({ eventId: 'evt_9999' }))
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.isValidation).toBe(true)
      expect(error.fieldErrors['eventId']).toMatch(/no longer exists/i)
    })

    it('rejects a fractional price rather than rounding it silently', async () => {
      const error = (await store
        .create(validPayload({ priceMinor: 12.5 }))
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.isValidation).toBe(true)
      expect(error.fieldErrors['priceMinor']).toBeTruthy()
    })

    it('accepts a free ticket at zero', async () => {
      await expect(store.create(validPayload({ priceMinor: 0 }))).resolves.toMatchObject({
        priceMinor: 0,
      })
    })

    it('moves a ticket to another event and reflects the new relation', async () => {
      await store.fetchList(createListQuery({ perPage: 10 }))
      const ticket = store.items[0]!
      const target = db.events.find((event) => event.id !== ticket.eventId)!

      const updated = await store.update(ticket.id, {
        name: ticket.name,
        priceMinor: ticket.priceMinor,
        currency: ticket.currency,
        quantity: ticket.quantity,
        status: ticket.status,
        eventId: target.id,
        categoryId: ticket.categoryId,
      })

      expect(updated.event.name).toBe(target.name)
      expect(store.items.find((row) => row.id === ticket.id)?.event.name).toBe(target.name)
    })

    it('deletes a ticket and drops it from the cache', async () => {
      await store.fetchList(createListQuery({ perPage: 10 }))
      const ticket = store.items[0]!

      await store.remove(ticket.id)

      expect(store.items.some((row) => row.id === ticket.id)).toBe(false)
      expect(store.meta.total).toBe(249)
    })
  })
})
