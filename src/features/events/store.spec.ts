import { http as mswHttp, HttpResponse } from 'msw'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useEventsStore } from '@/features/events/store'
import { db } from '@/mocks/db'
import { server } from '@/mocks/server'
import { configureHttp, resetHttpConfig, type ApiError } from '@/shared/api'
import { createListQuery } from '@/shared/types/api'
import { signIn } from '@tests/utils/apiClient'

const ORIGIN = window.location.origin

let store: ReturnType<typeof useEventsStore>

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Store Test Festival',
    country: 'France',
    venue: 'Accor Arena',
    startDate: '2027-05-01T18:00:00.000Z',
    endDate: '2027-05-02T22:00:00.000Z',
    status: 'draft' as const,
    ...overrides,
  }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  const token = await signIn()
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => token })
  store = useEventsStore()
})

afterEach(() => {
  resetHttpConfig()
})

describe('events store', () => {
  it('loads a page with server-reported meta', async () => {
    await store.fetchList(createListQuery({ perPage: 5 }))

    expect(store.status).toBe('success')
    expect(store.items).toHaveLength(5)
    expect(store.meta.total).toBe(30)
  })

  /*
   * One test, not one per filter. Filtering correctness belongs to `src/mocks/query.spec.ts` and
   * `tests/mock-api/querying.spec.ts`. What only this layer shows is that the store sends the
   * query onward and keeps the response, instead of loading everything and narrowing it here.
   * Country is the filter used because nothing else in the suite covers it.
   */
  it('sends the query to the server rather than filtering locally', async () => {
    await store.fetchList(createListQuery({ perPage: 100, filters: { country: 'France' } }))

    expect(store.items.length).toBeGreaterThan(0)
    expect(store.items.length).toBeLessThan(db.events.length)
    expect(store.items.every((event) => event.country === 'France')).toBe(true)
  })

  describe('countries', () => {
    it('loads the distinct country list', async () => {
      await store.fetchCountries()

      expect(store.countries.length).toBeGreaterThan(0)
      expect(store.countries).toContain('France')
      expect(new Set(store.countries).size).toBe(store.countries.length)
    })

    it('degrades to an empty list rather than breaking the page', async () => {
      server.use(
        mswHttp.get(
          `${ORIGIN}/api/events/countries`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      )

      await expect(store.fetchCountries()).resolves.toBeUndefined()
      expect(store.countries).toEqual([])
    })
  })

  describe('mutations', () => {
    it('creates an event', async () => {
      const created = await store.create(validPayload())

      expect(created.id).toMatch(/^evt_\d+$/)
      expect(created.ticketCount).toBe(0)
    })

    it('rejects an end date before the start, on the field the admin must change', async () => {
      const error = (await store
        .create(validPayload({ endDate: '2027-04-01T10:00:00.000Z' }))
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.isValidation).toBe(true)
      expect(error.fieldErrors['endDate']).toBe('The end date must be on or after the start date')
    })

    it('patches the cached row on update', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))
      const target = store.items[0]!

      await store.update(target.id, validPayload({ name: 'Renamed Festival' }))

      expect(store.items.find((event) => event.id === target.id)?.name).toBe('Renamed Festival')
    })

    it('refuses to delete an event that still has tickets, and keeps the row', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))
      const inUse = store.items.find((event) => event.ticketCount > 0)!

      const error = (await store.remove(inUse.id).catch((caught: unknown) => caught)) as ApiError

      expect(error.isConflict).toBe(true)
      expect(error.message).toMatch(/still has \d+ ticket/i)
      expect(store.items.some((event) => event.id === inUse.id)).toBe(true)
    })

    it('deletes an event with no tickets', async () => {
      const created = await store.create(validPayload())
      await store.fetchList(createListQuery({ perPage: 100 }))

      await expect(store.remove(created.id)).resolves.toBeUndefined()
      expect(store.items.some((event) => event.id === created.id)).toBe(false)
    })
  })

  describe('relation options', () => {
    it('loads a small searchable page and pins a selected ref outside it', async () => {
      await store.fetchList(createListQuery({ sort: 'name', order: 'asc', perPage: 100 }))
      const sorted = [...store.items].sort((a, b) => a.name.localeCompare(b.name))
      expect(sorted.length).toBeGreaterThan(20)

      const outsideFirstPage = sorted[20]
      expect(outsideFirstPage).toBeDefined()

      await store.fetchOptions()
      expect(store.options).toHaveLength(20)
      expect(store.options.some((option) => option.id === outsideFirstPage!.id)).toBe(false)

      const pin = { id: outsideFirstPage!.id, name: outsideFirstPage!.name }
      await store.fetchOptions({ pin })
      expect(store.options[0]).toEqual(pin)
      expect(store.options).toHaveLength(21)

      await store.fetchOptions({ search: outsideFirstPage!.name })
      expect(store.options.some((option) => option.id === outsideFirstPage!.id)).toBe(true)
    })

    it('degrades to the pin alone when the request fails', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/events`, () =>
          HttpResponse.json({ message: 'Unavailable' }, { status: 503 }),
        ),
      )

      const pin = { id: 'evt_pin', name: 'Pinned Event' }
      await store.fetchOptions({ pin })
      expect(store.options).toEqual([pin])
    })
  })
})
