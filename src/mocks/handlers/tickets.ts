import { http, HttpResponse, type RequestHandler } from 'msw'

import { ticketSchema } from '@/features/tickets/schema'
import type { Ticket, TicketWithRelations } from '@/features/tickets/types'
import { db, nextId, nowIso, syncDerivedCounts } from '@/mocks/db'
import { API_BASE } from '@/mocks/handlers/base'
import { runQuery } from '@/mocks/query'
import type { EntityRef } from '@/shared/types/entity'
import { errorResponse, notFound, parseBody, preflight, requireAuth, touch } from '@/mocks/support'

const RESOURCE = `${API_BASE}/tickets`

const UNKNOWN_REF: EntityRef = { id: '', name: 'Unknown' }

/**
 * Embeds the event and category so a table row can show names without a request per row.
 *
 * This is the mock standing in for a backend join. Doing it client-side would mean either
 * N+1 requests or loading every event and category up front — both of which stop working at
 * the scale the brief asks about.
 */
function expand(ticket: Ticket): TicketWithRelations {
  const event = db.events.find((candidate) => candidate.id === ticket.eventId)
  const category = db.categories.find((candidate) => candidate.id === ticket.categoryId)

  return {
    ...ticket,
    event: event ? { id: event.id, name: event.name } : UNKNOWN_REF,
    category: category ? { id: category.id, name: category.name } : UNKNOWN_REF,
  }
}

/** Rejects a payload that points at an event or category which does not exist. */
function relationErrors(eventId: string, categoryId: string): Record<string, string> | null {
  const errors: Record<string, string> = {}

  if (!db.events.some((event) => event.id === eventId)) {
    errors['eventId'] = 'That event no longer exists. Choose another.'
  }
  if (!db.categories.some((category) => category.id === categoryId)) {
    errors['categoryId'] = 'That category no longer exists. Choose another.'
  }

  return Object.keys(errors).length > 0 ? errors : null
}

function findTicket(id: string): Ticket | undefined {
  return db.tickets.find((ticket) => ticket.id === id)
}

export const ticketHandlers: RequestHandler[] = [
  http.get(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    /*
     * Relations are expanded *before* querying, so search and sort can reach through to the
     * event and category names — an admin searching "Summer Gala" expects to find its tickets.
     */
    const expanded = db.tickets.map(expand)

    const result = runQuery(expanded, new URL(request.url), {
      searchable: (ticket) => [ticket.name, ticket.event.name, ticket.category.name],
      filters: {
        status: (ticket, value) => ticket.status === value,
        eventId: (ticket, value) => ticket.eventId === value,
        categoryId: (ticket, value) => ticket.categoryId === value,
        currency: (ticket, value) => ticket.currency === value,
        minPrice: (ticket, value) => ticket.priceMinor >= Number(value),
        maxPrice: (ticket, value) => ticket.priceMinor <= Number(value),
      },
      sortable: {
        name: (ticket) => ticket.name,
        priceMinor: (ticket) => ticket.priceMinor,
        quantity: (ticket) => ticket.quantity,
        status: (ticket) => ticket.status,
        event: (ticket) => ticket.event.name,
        category: (ticket) => ticket.category.name,
        createdAt: (ticket) => ticket.createdAt,
        updatedAt: (ticket) => ticket.updatedAt,
      },
      defaultSort: 'createdAt',
    })

    return HttpResponse.json({ data: result.data, meta: result.meta })
  }),

  http.get(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const ticket = findTicket(String(params['id']))
    return ticket ? HttpResponse.json(expand(ticket)) : notFound('ticket')
  }),

  http.post(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const parsed = await parseBody(request, ticketSchema)
    if (!parsed.ok) return parsed.response

    const errors = relationErrors(parsed.data.eventId, parsed.data.categoryId)
    if (errors) return errorResponse(422, 'Some of the details are not valid.', errors)

    const timestamp = nowIso()
    const ticket: Ticket = {
      id: nextId('tkt'),
      ...parsed.data,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    db.tickets.push(ticket)
    syncDerivedCounts()

    return HttpResponse.json(expand(ticket), { status: 201 })
  }),

  http.patch(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const ticket = findTicket(String(params['id']))
    if (!ticket) return notFound('ticket')

    const parsed = await parseBody(request, ticketSchema)
    if (!parsed.ok) return parsed.response

    const errors = relationErrors(parsed.data.eventId, parsed.data.categoryId)
    if (errors) return errorResponse(422, 'Some of the details are not valid.', errors)

    Object.assign(ticket, parsed.data)
    touch(ticket, nowIso())
    syncDerivedCounts()

    return HttpResponse.json(expand(ticket))
  }),

  http.delete(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const id = String(params['id'])
    if (!findTicket(id)) return notFound('ticket')

    db.tickets = db.tickets.filter((ticket) => ticket.id !== id)
    syncDerivedCounts()

    return new HttpResponse(null, { status: 204 })
  }),
]
