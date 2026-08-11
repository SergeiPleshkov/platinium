import { beforeEach, describe, expect, it } from 'vitest'

import type { Event } from '@/features/events/types'
import type { TicketWithRelations } from '@/features/tickets/types'
import { db } from '@/mocks/db'
import { EVENT_COUNT, TICKET_COUNT } from '@/mocks/fixtures'
import type { ApiErrorBody, ListResponse } from '@/shared/types/api'
import { get, signIn } from '@tests/utils/apiClient'

/**
 * Proves the querying contract the whole client depends on.
 *
 * The point of these tests is that search, filtering, sorting and pagination happen on the
 * *server*. If the handlers returned whole collections and let the client sort them, the UI
 * would look identical while the architecture answer to "scale this to hundreds of thousands
 * of tickets" would be wrong. The assertion that makes this concrete: a request never returns
 * more rows than `perPage`, and `meta.total` describes the filtered set.
 */

let token: string

beforeEach(async () => {
  token = await signIn()
})

function tickets(query: string) {
  return get<ListResponse<TicketWithRelations>>(`/api/tickets?${query}`, token)
}

function events(query: string) {
  return get<ListResponse<Event>>(`/api/events?${query}`, token)
}

describe('querying is server-side', () => {
  it('never ships the whole collection, however large it is', async () => {
    const result = await tickets('perPage=10')

    expect(db.tickets.length).toBe(TICKET_COUNT)
    expect(result.body.data).toHaveLength(10)
    expect(result.body.meta.total).toBe(TICKET_COUNT)
    expect(result.body.meta.totalPages).toBe(25)
  })

  it('caps an over-large perPage instead of honouring it', async () => {
    const result = await tickets('perPage=100000')

    expect(result.body.data.length).toBeLessThanOrEqual(100)
    expect(result.body.meta.perPage).toBe(100)
  })

  it('returns disjoint, complete pages', async () => {
    const [first, second] = await Promise.all([
      tickets('sort=name&order=asc&page=1&perPage=25'),
      tickets('sort=name&order=asc&page=2&perPage=25'),
    ])

    const firstIds = first.body.data.map((ticket) => ticket.id)
    const secondIds = second.body.data.map((ticket) => ticket.id)

    expect(firstIds).toHaveLength(25)
    expect(secondIds).toHaveLength(25)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
  })

  it('walks every page without gaps or repeats', async () => {
    const seen = new Set<string>()
    const perPage = 50

    for (let page = 1; page <= Math.ceil(TICKET_COUNT / perPage); page += 1) {
      const result = await tickets(`sort=createdAt&order=asc&page=${page}&perPage=${perPage}`)
      for (const ticket of result.body.data) seen.add(ticket.id)
    }

    expect(seen.size).toBe(TICKET_COUNT)
  })

  it('sorts across the whole collection, not just the current page', async () => {
    const ascending = await tickets('sort=priceMinor&order=asc&perPage=1')
    const descending = await tickets('sort=priceMinor&order=desc&perPage=1')

    const cheapest = Math.min(...db.tickets.map((ticket) => ticket.priceMinor))
    const dearest = Math.max(...db.tickets.map((ticket) => ticket.priceMinor))

    expect(ascending.body.data[0]?.priceMinor).toBe(cheapest)
    expect(descending.body.data[0]?.priceMinor).toBe(dearest)
  })

  it('filters before paginating, so meta.total reflects the filter', async () => {
    const soldOutInDb = db.tickets.filter((ticket) => ticket.status === 'sold_out').length
    const result = await tickets('status=sold_out&perPage=5')

    expect(soldOutInDb).toBeGreaterThan(0)
    expect(result.body.meta.total).toBe(soldOutInDb)
    expect(result.body.data.every((ticket) => ticket.status === 'sold_out')).toBe(true)
  })

  it('filters tickets by category', async () => {
    const category = db.categories.find((candidate) => candidate.ticketCount > 0)!
    const result = await tickets(`categoryId=${category.id}&perPage=100`)

    expect(result.body.meta.total).toBe(category.ticketCount)
    expect(result.body.data.every((ticket) => ticket.categoryId === category.id)).toBe(true)
  })

  it('filters events by status', async () => {
    const publishedInDb = db.events.filter((event) => event.status === 'published').length
    const result = await events('status=published&perPage=100')

    expect(publishedInDb).toBeGreaterThan(0)
    expect(result.body.meta.total).toBe(publishedInDb)
    expect(result.body.data.every((event) => event.status === 'published')).toBe(true)
  })

  /*
   * Cross-checks two things the handlers maintain separately: the filtered `meta.total`, and the
   * `ticketCount` that `syncDerivedCounts` denormalises onto the event. They are computed by
   * different code, so they are free to disagree, and a stale counter is invisible on screen.
   */
  it('reports a filtered total matching the denormalised ticketCount', async () => {
    const event = db.events[0]!
    const result = await tickets(`eventId=${event.id}&perPage=100`)

    expect(event.ticketCount).toBeGreaterThan(0)
    expect(result.body.meta.total).toBe(event.ticketCount)
  })

  it('searches through embedded relation names, not just the ticket', async () => {
    const event = db.events[0]!
    const result = await tickets(`search=${encodeURIComponent(event.name)}&perPage=100`)

    expect(result.body.meta.total).toBeGreaterThan(0)
    expect(result.body.data.every((ticket) => ticket.event.name === event.name)).toBe(true)
  })

  it('combines search, filter, sort and pagination in one request', async () => {
    const result = await tickets('search=a&status=on_sale&sort=priceMinor&order=asc&perPage=5')

    const prices = result.body.data.map((ticket) => ticket.priceMinor)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(result.body.data.every((ticket) => ticket.status === 'on_sale')).toBe(true)
    expect(result.body.data.length).toBeLessThanOrEqual(5)
  })

  it('applies a price range filter', async () => {
    const result = await tickets('minPrice=5000&maxPrice=10000&perPage=100')

    expect(result.body.data.length).toBeGreaterThan(0)
    expect(
      result.body.data.every((ticket) => ticket.priceMinor >= 5000 && ticket.priceMinor <= 10_000),
    ).toBe(true)
  })

  it('ORs repeated filter values and ANDs across fields', async () => {
    const result = await tickets('status=draft&status=paused&perPage=100')

    expect(result.body.data.every((t) => t.status === 'draft' || t.status === 'paused')).toBe(true)
    expect(result.body.meta.total).toBe(
      db.tickets.filter((t) => t.status === 'draft' || t.status === 'paused').length,
    )
  })

  it('filters events by a date window', async () => {
    const from = '2026-09-01T00:00:00.000Z'
    const result = await events(`startsAfter=${from}&perPage=100`)

    expect(result.body.data.every((event) => event.startDate >= from)).toBe(true)
    expect(result.body.meta.total).toBe(
      db.events.filter((event) => Date.parse(event.startDate) >= Date.parse(from)).length,
    )
  })

  it('returns an empty page with honest meta when nothing matches', async () => {
    const result = await tickets('search=definitely-not-a-real-ticket')

    expect(result.body.data).toEqual([])
    expect(result.body.meta.total).toBe(0)
    expect(result.body.meta.totalPages).toBe(1)
  })

  it('seeds a dataset large enough for pagination to be meaningful', () => {
    expect(db.events).toHaveLength(EVENT_COUNT)
    expect(db.tickets.length).toBeGreaterThanOrEqual(200)
  })
})

describe('failure injection', () => {
  it('forces a failure for a single request via the x-mock-fail header', async () => {
    const failed = await get<ApiErrorBody>('/api/tickets', token)
    expect(failed.status).toBe(200)

    const response = await fetch(`${window.location.origin}/api/tickets`, {
      headers: { authorization: `Bearer ${token}`, 'x-mock-fail': '500' },
    })
    const body = (await response.json()) as ApiErrorBody

    expect(response.status).toBe(500)
    expect(body.message).toMatch(/went wrong/i)
  })

  it('leaves subsequent requests unaffected', async () => {
    await fetch(`${window.location.origin}/api/tickets`, {
      headers: { authorization: `Bearer ${token}`, 'x-mock-fail': '503' },
    })

    const after = await tickets('perPage=1')
    expect(after.status).toBe(200)
  })
})

describe('database isolation between tests', () => {
  it('sees pristine seed data despite other specs creating and deleting rows', () => {
    expect(db.tickets).toHaveLength(TICKET_COUNT)
    expect(db.events).toHaveLength(EVENT_COUNT)
    expect(db.categories).toHaveLength(10)
  })
})
