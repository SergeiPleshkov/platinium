import { createPinia, setActivePinia } from 'pinia'
import { http as mswHttp, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useCategoriesStore } from '@/features/categories/store'
import { db } from '@/mocks/db'
import { server } from '@/mocks/server'
import { ApiError, configureHttp, resetHttpConfig } from '@/shared/api'
import { createListQuery } from '@/shared/types/api'
import { signIn } from '@tests/utils/apiClient'

/**
 * Store tests run against the real mock backend, not a stubbed API module. A store whose
 * dependencies are all mocked only proves the mocks were called.
 */

const ORIGIN = window.location.origin

let store: ReturnType<typeof useCategoriesStore>

beforeEach(async () => {
  setActivePinia(createPinia())
  const token = await signIn()
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => token })
  store = useCategoriesStore()
})

afterEach(() => {
  resetHttpConfig()
})

describe('categories store', () => {
  describe('fetchList', () => {
    it('starts idle and empty', () => {
      expect(store.status).toBe('idle')
      expect(store.items).toEqual([])
      expect(store.isEmpty).toBe(false)
    })

    it('loads a page and reports meta from the server', async () => {
      await store.fetchList(createListQuery({ perPage: 4 }))

      expect(store.status).toBe('success')
      expect(store.items).toHaveLength(4)
      expect(store.meta).toEqual({ total: 10, page: 1, perPage: 4, totalPages: 3 })
      expect(store.total).toBe(10)
    })

    it('passes search through to the server rather than filtering locally', async () => {
      await store.fetchList(createListQuery({ search: 'VIP', perPage: 100 }))

      expect(store.items.length).toBeGreaterThan(0)
      expect(store.items.length).toBeLessThan(10)
      expect(store.items.every((category) => /vip/i.test(category.name))).toBe(true)
    })

    it('reports an empty result distinctly from an unloaded one', async () => {
      await store.fetchList(createListQuery({ search: 'definitely-not-a-category' }))

      expect(store.status).toBe('success')
      expect(store.isEmpty).toBe(true)
      expect(store.items).toEqual([])
    })

    it('records a failure with a message the page can render', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/categories`, () =>
          HttpResponse.json({ message: 'Server exploded.' }, { status: 500 }),
        ),
      )

      await store.fetchList(createListQuery())

      expect(store.status).toBe('error')
      expect(store.hasError).toBe(true)
      expect(store.errorMessage).toBe('Server exploded.')
    })

    it('does not throw on failure, a list error is a state, not an exception', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/categories`, () => new HttpResponse(null, { status: 500 })),
      )

      await expect(store.fetchList(createListQuery())).resolves.toBeUndefined()
    })

    it('clears a previous error on the next attempt', async () => {
      server.use(
        mswHttp.get(`${ORIGIN}/api/categories`, () => new HttpResponse(null, { status: 500 })),
      )
      await store.fetchList(createListQuery())
      expect(store.hasError).toBe(true)

      server.resetHandlers()
      await store.fetchList(createListQuery())

      expect(store.hasError).toBe(false)
      expect(store.errorMessage).toBeUndefined()
    })

    it('leaves state untouched when a request is superseded', async () => {
      await store.fetchList(createListQuery({ perPage: 4 }))
      const loaded = [...store.items]

      const controller = new AbortController()
      const pending = store.fetchList(createListQuery({ perPage: 4 }), controller.signal)
      controller.abort()
      await pending

      // An aborted request must not blank the table or raise an error.
      expect(store.items).toEqual(loaded)
      expect(store.hasError).toBe(false)
    })
  })

  describe('create', () => {
    it('persists and returns the new record', async () => {
      const created = await store.create({ name: 'Press Gallery', description: 'Media only.' })

      expect(created.id).toMatch(/^cat_\d+$/)
      expect(created.ticketCount).toBe(0)
      expect(db.categories.some((category) => category.id === created.id)).toBe(true)
    })

    it('rethrows a 422 with its field errors, so the form can place them', async () => {
      const error = await store
        .create({ name: '', description: '' })
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).isValidation).toBe(true)
      expect((error as ApiError).fieldErrors).toEqual({ name: 'Enter a category name' })
    })

    it('rethrows a duplicate-name conflict against the name field', async () => {
      const error = (await store
        .create({ name: 'VIP', description: '' })
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.fieldErrors['name']).toMatch(/already exists/i)
    })
  })

  describe('update', () => {
    it('patches the cached row rather than refetching the page', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))
      const target = store.items[0]!

      const updated = await store.update(target.id, {
        name: 'Renamed Tier',
        description: target.description,
      })

      expect(updated.name).toBe('Renamed Tier')
      expect(store.items.find((category) => category.id === target.id)?.name).toBe('Renamed Tier')
    })

    it('leaves the cache alone when the update fails', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))
      const target = store.items[0]!
      const originalName = target.name

      await store.update(target.id, { name: '', description: '' }).catch(() => undefined)

      expect(store.items.find((category) => category.id === target.id)?.name).toBe(originalName)
    })

    it('rethrows a 404 for a record deleted by someone else', async () => {
      const error = (await store
        .update('cat_999', { name: 'Ghost', description: '' })
        .catch((caught: unknown) => caught)) as ApiError

      expect(error.status).toBe(404)
    })
  })

  describe('relation options', () => {
    it('loads a small searchable page and pins a selected ref outside it', async () => {
      // Seed past RELATION_OPTIONS_PER_PAGE so pinning outside the first page is observable.
      for (let index = 0; index < 15; index += 1) {
        await store.create({ name: `Rel Opt ${String(index).padStart(2, '0')}`, description: '' })
      }

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
        mswHttp.get(`${ORIGIN}/api/categories`, () =>
          HttpResponse.json({ message: 'Unavailable' }, { status: 503 }),
        ),
      )

      const pin = { id: 'cat_pin', name: 'Pinned Category' }
      await store.fetchOptions({ pin })
      expect(store.options).toEqual([pin])
    })
  })

  describe('remove', () => {
    it('drops the row from the cache and decrements the total', async () => {
      const created = await store.create({ name: 'Temporary', description: '' })
      await store.fetchList(createListQuery({ perPage: 100 }))
      const totalBefore = store.meta.total

      await store.remove(created.id)

      expect(store.items.some((category) => category.id === created.id)).toBe(false)
      expect(store.meta.total).toBe(totalBefore - 1)
    })

    it('rethrows the conflict when the category still has tickets, keeping the row', async () => {
      await store.fetchList(createListQuery({ perPage: 100 }))
      const inUse = store.items.find((category) => category.ticketCount > 0)!

      const error = (await store.remove(inUse.id).catch((caught: unknown) => caught)) as ApiError

      expect(error.isConflict).toBe(true)
      expect(error.message).toMatch(/still has \d+ ticket/i)
      expect(store.items.some((category) => category.id === inUse.id)).toBe(true)
    })
  })
})
