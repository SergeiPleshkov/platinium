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

  /*
   * One test, not one per filter. Whether the *engine* filters correctly is proven directly in
   * `src/mocks/query.spec.ts` and over HTTP in `tests/mock-api/querying.spec.ts`. What only this
   * layer can show is that the store hands the query to the server and keeps what comes back,
   * instead of fetching everything and narrowing it here.
   */
  it('sends the query to the server rather than filtering locally', async () => {
    const event = db.events[0]!
    await store.fetchList(createListQuery({ perPage: 100, filters: { eventId: event.id } }))

    expect(store.items.length).toBeGreaterThan(0)
    expect(store.items.length).toBeLessThan(db.tickets.length)
    expect(store.items.every((ticket) => ticket.eventId === event.id)).toBe(true)
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
