import { http, HttpResponse, type RequestHandler } from 'msw'

import type { DashboardStats } from '@/features/dashboard/types'
import { db } from '@/mocks/db'
import { API_BASE } from '@/mocks/handlers/base'
import { preflight, requireAuth } from '@/mocks/support'
import type { CurrencyCode } from '@/shared/utils/money'

/**
 * Dashboard aggregation.
 *
 * Every figure is computed here, on the server side of the boundary, and the client receives
 * only the results. That is the whole point: the browser never sees 250 tickets in order to
 * report a total, so the same screen works unchanged at 250,000.
 */
export const statsHandlers: RequestHandler[] = [
  http.get(`${API_BASE}/stats`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const now = Date.now()

    const upcoming = db.events
      .filter((event) => Date.parse(event.startDate) > now && event.status !== 'cancelled')
      .sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))

    const inventoryByCurrency = new Map<CurrencyCode, number>()
    let inventory = 0
    let onSale = 0
    let soldOut = 0

    for (const ticket of db.tickets) {
      inventory += ticket.quantity
      if (ticket.status === 'on_sale') onSale += 1
      if (ticket.status === 'sold_out') soldOut += 1

      inventoryByCurrency.set(
        ticket.currency,
        (inventoryByCurrency.get(ticket.currency) ?? 0) + ticket.priceMinor * ticket.quantity,
      )
    }

    const busiestEvents = [...db.events]
      .sort((a, b) => b.ticketCount - a.ticketCount)
      .slice(0, 5)
      .map((event) => ({
        eventId: event.id,
        eventName: event.name,
        ticketCount: event.ticketCount,
      }))

    const stats: DashboardStats = {
      events: {
        total: db.events.length,
        published: db.events.filter((event) => event.status === 'published').length,
        upcoming: upcoming.length,
      },
      categories: { total: db.categories.length },
      tickets: { total: db.tickets.length, onSale, soldOut, inventory },
      inventoryValue: [...inventoryByCurrency]
        .map(([currency, totalMinor]) => ({ currency, totalMinor }))
        .sort((a, b) => b.totalMinor - a.totalMinor),
      busiestEvents,
      upcomingEvents: upcoming.slice(0, 5).map((event) => ({
        id: event.id,
        name: event.name,
        startDate: event.startDate,
        venue: event.venue,
        status: event.status,
        ticketCount: event.ticketCount,
      })),
    }

    return HttpResponse.json(stats)
  }),
]
