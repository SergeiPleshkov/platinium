import { http, HttpResponse, type RequestHandler } from 'msw'

import { ticketSchema } from '@/features/tickets/schema'
import {
  TICKET_STATUSES,
  type Ticket,
  type TicketStatus,
  type TicketWithRelations,
} from '@/features/tickets/types'
import { db, nextId, nowIso, syncDerivedCounts } from '@/mocks/db'
import { API_BASE } from '@/mocks/handlers/base'
import { toCsv } from '@/mocks/csv'
import { handleBulk } from '@/mocks/bulk'
import { importTickets, isImportRequest } from '@/mocks/handlers/ticketsImport'
import { applyQuery, runQuery } from '@/mocks/query'
import type { EntityRef } from '@/shared/types/entity'
import {
  errorResponse,
  notFound,
  parseBody,
  preflight,
  requireAuth,
  requirePermission,
  touch,
} from '@/mocks/support'

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

/**
 * The query configuration, shared by the list and export endpoints.
 *
 * Declared once on purpose: an export that filtered differently from the table it was
 * launched from would be worse than no export at all, and that divergence is invisible until
 * someone reconciles a spreadsheet by hand.
 */
const ticketQueryConfig = {
  searchable: (ticket: TicketWithRelations) => [
    ticket.name,
    ticket.event.name,
    ticket.category.name,
  ],
  filters: {
    status: (ticket: TicketWithRelations, value: string) => ticket.status === value,
    eventId: (ticket: TicketWithRelations, value: string) => ticket.eventId === value,
    categoryId: (ticket: TicketWithRelations, value: string) => ticket.categoryId === value,
    currency: (ticket: TicketWithRelations, value: string) => ticket.currency === value,
    minPrice: (ticket: TicketWithRelations, value: string) => ticket.priceMinor >= Number(value),
    maxPrice: (ticket: TicketWithRelations, value: string) => ticket.priceMinor <= Number(value),
  },
  sortable: {
    name: (ticket: TicketWithRelations) => ticket.name,
    priceMinor: (ticket: TicketWithRelations) => ticket.priceMinor,
    quantity: (ticket: TicketWithRelations) => ticket.quantity,
    status: (ticket: TicketWithRelations) => ticket.status,
    event: (ticket: TicketWithRelations) => ticket.event.name,
    category: (ticket: TicketWithRelations) => ticket.category.name,
    createdAt: (ticket: TicketWithRelations) => ticket.createdAt,
    updatedAt: (ticket: TicketWithRelations) => ticket.updatedAt,
  },
  defaultSort: 'createdAt',
}

/** Tickets have no dependants, so a delete only fails when the record has already gone. */
function deleteOneTicket(id: string): string | null {
  if (!findTicket(id)) return 'No longer exists.'

  db.tickets = db.tickets.filter((candidate) => candidate.id !== id)
  return null
}

function setOneTicketStatus(id: string, status: string): string | null {
  const ticket = findTicket(id)
  if (!ticket) return 'No longer exists.'

  ticket.status = status as TicketStatus
  touch(ticket, nowIso())
  return null
}

export const ticketHandlers: RequestHandler[] = [
  /**
   * Import, with a dry-run mode that the preview uses.
   *
   * The preview and the commit run the *same* validation, differing only in whether anything
   * is written. Validating separately in the browser would be a second implementation of one
   * rule, and could not answer the interesting questions — whether an event of that name
   * exists — without the client downloading every event.
   */
  http.post(`${RESOURCE}/import`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'import')
    if (forbidden) return forbidden

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return errorResponse(400, 'The request body was not valid JSON.')
    }

    if (!isImportRequest(raw)) {
      return errorResponse(400, 'An import needs a list of rows and a dryRun flag.')
    }
    if (raw.rows.length === 0) {
      return errorResponse(422, 'The file has no rows to import.')
    }

    return HttpResponse.json(importTickets(raw))
  }),

  // Before `/:id`, alongside `export`, so neither is captured as an id.
  http.post(`${RESOURCE}/bulk`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    return handleBulk(request, auth.user, {
      deleteOne: deleteOneTicket,
      setStatus: setOneTicketStatus,
      isValidStatus: (status) => TICKET_STATUSES.includes(status as TicketStatus),
      afterChange: syncDerivedCounts,
    })
  }),

  /**
   * CSV export of the *current query*, not the current page.
   *
   * Declared before `/:id` so `export` is not captured as an id. The client sends the same
   * filters it is displaying and gets every matching row back — the point being that the
   * browser never has to hold them.
   */
  http.get(`${RESOURCE}/export`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'export')
    if (forbidden) return forbidden

    /*
     * `applyQuery`, not `runQuery`: the list endpoint caps `perPage` at 100 so a client cannot
     * dump the table through it, and this endpoint is the sanctioned way to get everything
     * matching. Same search, filters and sort; no pagination.
     */
    const rows = applyQuery(db.tickets.map(expand), new URL(request.url), ticketQueryConfig)

    const csv = toCsv(rows, [
      { header: 'ID', value: (ticket) => ticket.id },
      { header: 'Name', value: (ticket) => ticket.name },
      { header: 'Event', value: (ticket) => ticket.event.name },
      { header: 'Category', value: (ticket) => ticket.category.name },
      // Minor units and currency as separate columns: a spreadsheet can compute on a number,
      // not on "€25.50".
      { header: 'Price (minor units)', value: (ticket) => ticket.priceMinor },
      { header: 'Currency', value: (ticket) => ticket.currency },
      { header: 'Quantity', value: (ticket) => ticket.quantity },
      { header: 'Status', value: (ticket) => ticket.status },
      { header: 'Created', value: (ticket) => ticket.createdAt },
    ])

    return new HttpResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }),

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
    const result = runQuery(expanded, new URL(request.url), ticketQueryConfig)

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
    const forbidden = requirePermission(auth.user, 'create')
    if (forbidden) return forbidden

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
    const forbidden = requirePermission(auth.user, 'update')
    if (forbidden) return forbidden

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
    const forbidden = requirePermission(auth.user, 'delete')
    if (forbidden) return forbidden

    const id = String(params['id'])
    if (!findTicket(id)) return notFound('ticket')

    db.tickets = db.tickets.filter((ticket) => ticket.id !== id)
    syncDerivedCounts()

    return new HttpResponse(null, { status: 204 })
  }),
]
