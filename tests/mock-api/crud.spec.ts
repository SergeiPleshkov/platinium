import { beforeEach, describe, expect, it } from 'vitest'

import type { Category } from '@/features/categories/types'
import type { Event } from '@/features/events/types'
import type { TicketWithRelations } from '@/features/tickets/types'
import { db } from '@/mocks/db'
import type { ApiErrorBody, ListResponse } from '@/shared/types/api'
import { del, get, patch, post, signIn } from '@tests/utils/apiClient'

let token: string

beforeEach(async () => {
  token = await signIn()
})

function validEventPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Integration Test Festival',
    country: 'France',
    venue: 'Accor Arena',
    startDate: '2027-03-01T18:00:00.000Z',
    endDate: '2027-03-02T23:00:00.000Z',
    status: 'draft',
    ...overrides,
  }
}

describe('mock API, categories', () => {
  it('lists with an accurate envelope', async () => {
    const result = await get<ListResponse<Category>>('/api/categories?perPage=4', token)

    expect(result.status).toBe(200)
    expect(result.body.data).toHaveLength(4)
    expect(result.body.meta).toEqual({ total: 10, page: 1, perPage: 4, totalPages: 3 })
  })

  it('reports how many tickets use each category', async () => {
    const result = await get<ListResponse<Category>>('/api/categories?perPage=100', token)
    const totalFromCounts = result.body.data.reduce(
      (sum, category) => sum + category.ticketCount,
      0,
    )

    expect(totalFromCounts).toBe(db.tickets.length)
  })

  it('creates, reads back, updates and deletes', async () => {
    const created = await post<Category>(
      '/api/categories',
      { name: 'Press Balcony', description: 'Reserved for accredited media.' },
      token,
    )
    expect(created.status).toBe(201)
    expect(created.body.id).toMatch(/^cat_\d+$/)
    expect(created.body.ticketCount).toBe(0)

    const fetched = await get<Category>(`/api/categories/${created.body.id}`, token)
    expect(fetched.body.name).toBe('Press Balcony')

    const updated = await patch<Category>(
      `/api/categories/${created.body.id}`,
      { name: 'Press Gallery', description: 'Reserved for accredited media.' },
      token,
    )
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe('Press Gallery')
    expect(updated.body.updatedAt >= updated.body.createdAt).toBe(true)

    expect((await del(`/api/categories/${created.body.id}`, token)).status).toBe(204)
    expect((await get(`/api/categories/${created.body.id}`, token)).status).toBe(404)
  })

  it('rejects an invalid payload with field errors', async () => {
    const result = await post<ApiErrorBody>('/api/categories', { name: '' }, token)

    expect(result.status).toBe(422)
    expect(result.body.errors).toEqual({ name: 'Enter a category name' })
  })

  it('rejects a duplicate name, case-insensitively', async () => {
    const result = await post<ApiErrorBody>(
      '/api/categories',
      { name: 'vip', description: '' },
      token,
    )

    expect(result.status).toBe(422)
    expect(result.body.errors?.['name']).toMatch(/already exists/i)
  })

  it('lets a category keep its own name on update', async () => {
    const existing = db.categories[0]!
    const result = await patch<Category>(
      `/api/categories/${existing.id}`,
      { name: existing.name, description: 'Reworded.' },
      token,
    )

    expect(result.status).toBe(200)
  })

  it('refuses to delete a category that still has tickets', async () => {
    const inUse = db.categories.find((category) => category.ticketCount > 0)!

    const result = await del<ApiErrorBody>(`/api/categories/${inUse.id}`, token)

    expect(result.status).toBe(409)
    expect(result.body.message).toMatch(/still has \d+ ticket/i)
    expect(db.categories.some((category) => category.id === inUse.id)).toBe(true)
  })

  it('404s for an unknown id', async () => {
    expect((await get('/api/categories/cat_999', token)).status).toBe(404)
    expect((await del('/api/categories/cat_999', token)).status).toBe(404)
  })
})

describe('mock API, events', () => {
  it('creates, updates and deletes an event with no tickets', async () => {
    const created = await post<Event>('/api/events', validEventPayload(), token)
    expect(created.status).toBe(201)
    expect(created.body.ticketCount).toBe(0)

    const updated = await patch<Event>(
      `/api/events/${created.body.id}`,
      validEventPayload({ status: 'published', venue: 'The O2' }),
      token,
    )
    expect(updated.body.status).toBe('published')
    expect(updated.body.venue).toBe('The O2')

    expect((await del(`/api/events/${created.body.id}`, token)).status).toBe(204)
  })

  it('enforces the date range at the API boundary, not just in the form', async () => {
    const result = await post<ApiErrorBody>(
      '/api/events',
      validEventPayload({
        startDate: '2027-03-10T18:00:00.000Z',
        endDate: '2027-03-01T18:00:00.000Z',
      }),
      token,
    )

    expect(result.status).toBe(422)
    expect(result.body.errors?.['endDate']).toBe('The end date must be on or after the start date')
  })

  it('refuses to delete an event that still has tickets', async () => {
    const inUse = db.events.find((event) => event.ticketCount > 0)!

    const result = await del<ApiErrorBody>(`/api/events/${inUse.id}`, token)

    expect(result.status).toBe(409)
    expect(result.body.message).toMatch(/still has \d+ ticket/i)
  })

  it('exposes the distinct countries for the filter control', async () => {
    const result = await get<string[]>('/api/events/countries', token)

    expect(result.status).toBe(200)
    expect(result.body).toContain('France')
    expect(result.body).toEqual([...result.body].sort((a, b) => a.localeCompare(b, 'en')))
    expect(new Set(result.body).size).toBe(result.body.length)
  })

  it('does not mistake /countries for an event id', async () => {
    const result = await get<string[]>('/api/events/countries', token)
    expect(Array.isArray(result.body)).toBe(true)
  })
})

describe('mock API, tickets', () => {
  it('embeds the event and category so a row can render names', async () => {
    const result = await get<ListResponse<TicketWithRelations>>('/api/tickets?perPage=5', token)

    expect(result.status).toBe(200)
    for (const ticket of result.body.data) {
      expect(ticket.event.name).toBeTruthy()
      expect(ticket.category.name).toBeTruthy()
      expect(ticket.event.id).toBe(ticket.eventId)
      expect(ticket.category.id).toBe(ticket.categoryId)
    }
  })

  it('creates a ticket and increments the derived counts', async () => {
    const event = db.events[0]!
    const category = db.categories[0]!
    const eventCountBefore = event.ticketCount
    const categoryCountBefore = category.ticketCount

    const created = await post<TicketWithRelations>(
      '/api/tickets',
      {
        name: 'Test Tier',
        priceMinor: 3500,
        currency: 'EUR',
        quantity: 100,
        status: 'on_sale',
        eventId: event.id,
        categoryId: category.id,
      },
      token,
    )

    expect(created.status).toBe(201)
    expect(created.body.event.name).toBe(event.name)

    const refreshedEvent = await get<Event>(`/api/events/${event.id}`, token)
    expect(refreshedEvent.body.ticketCount).toBe(eventCountBefore + 1)

    const refreshedCategory = await get<Category>(`/api/categories/${category.id}`, token)
    expect(refreshedCategory.body.ticketCount).toBe(categoryCountBefore + 1)
  })

  it('decrements the derived counts on delete', async () => {
    const ticket = db.tickets[0]!
    const before = db.events.find((event) => event.id === ticket.eventId)!.ticketCount

    expect((await del(`/api/tickets/${ticket.id}`, token)).status).toBe(204)

    const refreshed = await get<Event>(`/api/events/${ticket.eventId}`, token)
    expect(refreshed.body.ticketCount).toBe(before - 1)
  })

  it('rejects a ticket pointing at an event that does not exist', async () => {
    const result = await post<ApiErrorBody>(
      '/api/tickets',
      {
        name: 'Orphan',
        priceMinor: 1000,
        currency: 'EUR',
        quantity: 10,
        status: 'draft',
        eventId: 'evt_9999',
        categoryId: db.categories[0]!.id,
      },
      token,
    )

    expect(result.status).toBe(422)
    expect(result.body.errors?.['eventId']).toMatch(/no longer exists/i)
  })

  it('rejects a fractional price rather than silently rounding it', async () => {
    const result = await post<ApiErrorBody>(
      '/api/tickets',
      {
        name: 'Fractional',
        priceMinor: 12.5,
        currency: 'EUR',
        quantity: 10,
        status: 'draft',
        eventId: db.events[0]!.id,
        categoryId: db.categories[0]!.id,
      },
      token,
    )

    expect(result.status).toBe(422)
    expect(result.body.errors?.['priceMinor']).toBeTruthy()
  })

  it('moves a ticket between events and updates both counts', async () => {
    const ticket = db.tickets[0]!
    const target = db.events.find((event) => event.id !== ticket.eventId)!
    const sourceId = ticket.eventId
    const sourceBefore = db.events.find((event) => event.id === sourceId)!.ticketCount
    const targetBefore = target.ticketCount

    await patch<TicketWithRelations>(
      `/api/tickets/${ticket.id}`,
      {
        name: ticket.name,
        priceMinor: ticket.priceMinor,
        currency: ticket.currency,
        quantity: ticket.quantity,
        status: ticket.status,
        eventId: target.id,
        categoryId: ticket.categoryId,
      },
      token,
    )

    expect((await get<Event>(`/api/events/${sourceId}`, token)).body.ticketCount).toBe(
      sourceBefore - 1,
    )
    expect((await get<Event>(`/api/events/${target.id}`, token)).body.ticketCount).toBe(
      targetBefore + 1,
    )
  })
})
