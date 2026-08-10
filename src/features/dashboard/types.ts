import type { EventStatus } from '@/features/events'
import type { CurrencyCode } from '@/shared/utils/money'

/**
 * The dashboard's aggregate view.
 *
 * Computed by the server and delivered whole. The alternative — fetching every ticket and
 * reducing in the browser — is the exact pattern this application argues against everywhere
 * else, and it stops working long before the hundreds of thousands of tickets the brief asks
 * about.
 */

export interface CurrencyTotal {
  currency: CurrencyCode
  /** Integer minor units. Never summed across currencies. */
  totalMinor: number
}

export interface EventTicketCount {
  eventId: string
  eventName: string
  ticketCount: number
}

export interface UpcomingEvent {
  id: string
  name: string
  startDate: string
  venue: string
  status: EventStatus
  ticketCount: number
}

export interface DashboardStats {
  events: { total: number; published: number; upcoming: number }
  categories: { total: number }
  tickets: { total: number; onSale: number; soldOut: number; inventory: number }
  /** Price × remaining quantity, grouped by currency because adding them would be nonsense. */
  inventoryValue: CurrencyTotal[]
  /** The five events carrying the most ticket types. */
  busiestEvents: EventTicketCount[]
  /** The five soonest events that have not started. */
  upcomingEvents: UpcomingEvent[]
}
