import { http, HttpResponse, type RequestHandler } from 'msw'

import { eventSchema } from '@/features/events/schema'
import { EVENT_STATUSES, type Event, type EventStatus } from '@/features/events/types'
import { db, nextId, nowIso, syncDerivedCounts } from '@/mocks/db'
import { API_BASE } from '@/mocks/handlers/base'
import { handleBulk } from '@/mocks/bulk'
import { runQuery } from '@/mocks/query'
import {
  errorResponse,
  notFound,
  parseBody,
  preflight,
  requireAuth,
  requirePermission,
  touch,
} from '@/mocks/support'

const RESOURCE = `${API_BASE}/events`

function findEvent(id: string): Event | undefined {
  return db.events.find((event) => event.id === id)
}

/** One delete, with the same ticket guard the single-record endpoint enforces. */
function dependentTicketCount(eventId: string): number {
  return db.tickets.filter((ticket) => ticket.eventId === eventId).length
}

function deleteOneEvent(id: string): string | null {
  const event = findEvent(id)
  if (!event) return 'No longer exists.'

  const ticketCount = dependentTicketCount(id)
  if (ticketCount > 0) {
    return `Still has ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}.`
  }

  db.events = db.events.filter((candidate) => candidate.id !== id)
  return null
}

function setOneEventStatus(id: string, status: string): string | null {
  const event = findEvent(id)
  if (!event) return 'No longer exists.'

  event.status = status as EventStatus
  touch(event, nowIso())
  return null
}

export const eventHandlers: RequestHandler[] = [
  // Before `/:id`, so `bulk` is not captured as an id.
  http.post(`${RESOURCE}/bulk`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    return handleBulk(request, auth.user, {
      deleteOne: deleteOneEvent,
      setStatus: setOneEventStatus,
      isValidStatus: (status) => EVENT_STATUSES.includes(status as EventStatus),
      afterChange: syncDerivedCounts,
    })
  }),

  http.get(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)

    const result = runQuery(db.events, url, {
      searchable: (event) => [event.name, event.venue, event.country],
      filters: {
        status: (event, value) => event.status === value,
        country: (event, value) => event.country === value,
        /* Date-window filters, so "what's on this quarter" is a server-side question. */
        startsAfter: (event, value) => Date.parse(event.startDate) >= Date.parse(value),
        startsBefore: (event, value) => Date.parse(event.startDate) <= Date.parse(value),
      },
      sortable: {
        name: (event) => event.name,
        country: (event) => event.country,
        venue: (event) => event.venue,
        startDate: (event) => Date.parse(event.startDate),
        endDate: (event) => Date.parse(event.endDate),
        status: (event) => event.status,
        ticketCount: (event) => event.ticketCount,
        createdAt: (event) => event.createdAt,
      },
      defaultSort: 'startDate',
    })

    return HttpResponse.json({ data: result.data, meta: result.meta })
  }),

  /**
   * The distinct countries currently in use, for the filter dropdown.
   *
   * Declared before `/:id` because MSW matches in order and `/countries` would otherwise be
   * captured as an id.
   */
  http.get(`${RESOURCE}/countries`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const countries = [...new Set(db.events.map((event) => event.country))].sort((a, b) =>
      a.localeCompare(b, 'en'),
    )

    return HttpResponse.json(countries)
  }),

  http.get(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const event = findEvent(String(params['id']))
    return event ? HttpResponse.json(event) : notFound('event')
  }),

  http.post(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'create')
    if (forbidden) return forbidden

    const parsed = await parseBody(request, eventSchema)
    if (!parsed.ok) return parsed.response

    const timestamp = nowIso()
    const event: Event = {
      id: nextId('evt'),
      ...parsed.data,
      ticketCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    db.events.push(event)
    return HttpResponse.json(event, { status: 201 })
  }),

  http.patch(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'update')
    if (forbidden) return forbidden

    const event = findEvent(String(params['id']))
    if (!event) return notFound('event')

    const parsed = await parseBody(request, eventSchema)
    if (!parsed.ok) return parsed.response

    Object.assign(event, parsed.data)
    touch(event, nowIso())

    return HttpResponse.json(event)
  }),

  http.delete(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'delete')
    if (forbidden) return forbidden

    const id = String(params['id'])
    const event = findEvent(id)
    if (!event) return notFound('event')

    /*
     * An event with tickets cannot be deleted. Cascading would silently destroy inventory,
     * so the server refuses and says exactly what stands in the way.
     */
    const ticketCount = dependentTicketCount(id)
    if (ticketCount > 0) {
      return errorResponse(
        409,
        `“${event.name}” still has ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}. ` +
          'Delete them first, or cancel the event instead.',
      )
    }

    db.events = db.events.filter((candidate) => candidate.id !== id)
    syncDerivedCounts()

    return new HttpResponse(null, { status: 204 })
  }),
]
