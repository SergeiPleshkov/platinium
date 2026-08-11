import type { Category } from '@/features/categories/types'
import { EVENT_STATUSES, type Event, type EventStatus } from '@/features/events/types'
import { TICKET_STATUSES, type Ticket, type TicketStatus } from '@/features/tickets/types'
import type { User } from '@/features/auth/types'
import { CURRENCIES, type CurrencyCode } from '@/shared/utils/money'
import { createRandom, sequentialId } from '@/mocks/fixtures/random'

/**
 * Seed data for the mock backend.
 *
 * Everything here is deterministic: a fixed seed, fixed ids, and a fixed clock. Two runs
 * produce byte-identical fixtures, which is what allows tests to assert on specific rows and
 * page boundaries. `SEED_NOW` is frozen rather than `Date.now()` for the same reason
 * otherwise "upcoming events" would drift out of the dataset over time.
 */

/** The reference "today" for all generated dates. */
export const SEED_NOW = new Date('2026-08-10T09:00:00.000Z')

const SEED = 20_260_810

export const CATEGORY_COUNT = 10
export const EVENT_COUNT = 30
export const TICKET_COUNT = 250

const CATEGORY_SEEDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'General Admission', description: 'Standard entry with unreserved seating.' },
  { name: 'VIP', description: 'Priority entry, reserved seating and hospitality access.' },
  { name: 'Early Bird', description: 'Discounted tier released ahead of general sale.' },
  { name: 'Student', description: 'Reduced price on presentation of a valid student card.' },
  { name: 'Group', description: 'Discounted rate for bookings of ten or more.' },
  { name: 'Backstage Pass', description: 'Includes a guided backstage tour before doors.' },
  { name: 'Season Pass', description: 'Admits the holder to every date in the series.' },
  { name: 'Accessible Seating', description: 'Step-free seating with a companion place.' },
  { name: 'Press', description: 'Accredited media access, issued on request.' },
  { name: 'Day Pass', description: 'Single-day entry to a multi-day event.' },
]

const VENUES: ReadonlyArray<{ venue: string; country: string; city: string }> = [
  { venue: 'Accor Arena', country: 'France', city: 'Paris' },
  { venue: 'Palais des Congrès', country: 'France', city: 'Paris' },
  { venue: 'Ziggo Dome', country: 'Netherlands', city: 'Amsterdam' },
  { venue: 'Mercedes-Benz Arena', country: 'Germany', city: 'Berlin' },
  { venue: 'Olympiahalle', country: 'Germany', city: 'Munich' },
  { venue: 'The O2', country: 'United Kingdom', city: 'London' },
  { venue: 'Utilita Arena', country: 'United Kingdom', city: 'Birmingham' },
  { venue: 'Palau Sant Jordi', country: 'Spain', city: 'Barcelona' },
  { venue: 'WiZink Center', country: 'Spain', city: 'Madrid' },
  { venue: 'Mediolanum Forum', country: 'Italy', city: 'Milan' },
  { venue: 'Royal Arena', country: 'Denmark', city: 'Copenhagen' },
  { venue: 'Hallenstadion', country: 'Switzerland', city: 'Zurich' },
]

const EVENT_PREFIXES = [
  'Summer',
  'Autumn',
  'Winter',
  'Spring',
  'Nordic',
  'Atlantic',
  'Midnight',
  'Golden',
  'Open Air',
  'Riverside',
] as const

const EVENT_SUBJECTS = [
  'Music Festival',
  'Tech Conference',
  'Design Summit',
  'Food Fair',
  'Comedy Night',
  'Film Premiere',
  'Art Biennale',
  'Startup Expo',
  'Marathon',
  'Jazz Weekend',
] as const

const TICKET_PREFIXES = ['Standard', 'Premium', 'Flexible', 'Advance', 'Late Release'] as const

export const SEED_USERS: readonly User[] = [
  { id: 'usr_001', email: 'admin@ticketing.test', name: 'Ada Okonjo', role: 'admin' },
  { id: 'usr_002', email: 'editor@ticketing.test', name: 'Bruno Kessler', role: 'editor' },
  { id: 'usr_003', email: 'viewer@ticketing.test', name: 'Cai Nguyen', role: 'viewer' },
]

/** The password every seeded account accepts. Authentication is mocked; see the README. */
export const SEED_PASSWORD = 'password123'

function isoDaysFrom(base: Date, days: number, hour = 10): string {
  const date = new Date(base)
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function buildCategories(): Category[] {
  return CATEGORY_SEEDS.map((seed, index) => ({
    id: sequentialId('cat', index + 1),
    name: seed.name,
    description: seed.description,
    ticketCount: 0,
    createdAt: isoDaysFrom(SEED_NOW, -365 + index * 7),
    updatedAt: isoDaysFrom(SEED_NOW, -30 + index),
  }))
}

export function buildEvents(): Event[] {
  const random = createRandom(SEED)

  return Array.from({ length: EVENT_COUNT }, (_unused, index) => {
    const location = VENUES[index % VENUES.length]!
    const prefix = EVENT_PREFIXES[index % EVENT_PREFIXES.length]!
    const subject = EVENT_SUBJECTS[(index * 3) % EVENT_SUBJECTS.length]!

    /*
     * Spread events from ~8 months in the past to ~10 months ahead, so "upcoming",
     * "in progress" and "finished" are all represented without depending on the wall clock.
     */
    const startOffsetDays = random.int(-240, 300)
    const durationDays = random.int(0, 3)

    return {
      id: sequentialId('evt', index + 1),
      name: `${prefix} ${subject} ${location.city}`,
      country: location.country,
      venue: location.venue,
      startDate: isoDaysFrom(SEED_NOW, startOffsetDays, random.int(9, 20)),
      endDate: isoDaysFrom(SEED_NOW, startOffsetDays + durationDays, random.int(21, 23)),
      status: statusForOffset(startOffsetDays, random),
      ticketCount: 0,
      createdAt: isoDaysFrom(SEED_NOW, startOffsetDays - random.int(30, 200)),
      updatedAt: isoDaysFrom(SEED_NOW, -random.int(1, 60)),
    }
  })
}

/** Keeps status plausible against the date: past events are finished, not "published". */
function statusForOffset(offsetDays: number, random: ReturnType<typeof createRandom>): EventStatus {
  if (offsetDays < -3) {
    return random.bool(0.1) ? 'cancelled' : 'completed'
  }
  if (offsetDays > 120) {
    return random.bool(0.4) ? 'draft' : 'published'
  }
  return random.bool(0.08) ? 'cancelled' : 'published'
}

export function buildTickets(events: readonly Event[], categories: readonly Category[]): Ticket[] {
  const random = createRandom(SEED + 1)

  return Array.from({ length: TICKET_COUNT }, (_unused, index) => {
    const event = events[index % events.length]!
    const category = categories[random.int(0, categories.length - 1)]!
    const currency: CurrencyCode = currencyForCountry(event.country)
    const quantity = random.int(0, 5) === 0 ? 0 : random.int(20, 2_000)

    return {
      id: sequentialId('tkt', index + 1, 4),
      name: `${random.pick(TICKET_PREFIXES)} ${category.name}`,
      priceMinor: priceForCategory(category.name, random),
      currency,
      quantity,
      status: statusForQuantity(quantity, event.status, random),
      eventId: event.id,
      categoryId: category.id,
      createdAt: isoDaysFrom(SEED_NOW, -random.int(10, 300)),
      updatedAt: isoDaysFrom(SEED_NOW, -random.int(0, 9)),
    }
  })
}

function currencyForCountry(country: string): CurrencyCode {
  if (country === 'United Kingdom') return 'GBP'
  if (country === 'Switzerland' || country === 'Denmark') return 'USD'
  return 'EUR'
}

/** Prices in minor units, banded by tier so sorting by price produces a meaningful order. */
function priceForCategory(name: string, random: ReturnType<typeof createRandom>): number {
  if (name === 'VIP' || name === 'Backstage Pass') return random.int(120, 450) * 100
  if (name === 'Season Pass') return random.int(180, 600) * 100
  if (name === 'Student' || name === 'Early Bird') return random.int(12, 45) * 100
  if (name === 'Press') return 0
  return random.int(25, 110) * 100 + random.pick([0, 50, 99])
}

function statusForQuantity(
  quantity: number,
  eventStatus: EventStatus,
  random: ReturnType<typeof createRandom>,
): TicketStatus {
  if (quantity === 0) return 'sold_out'
  if (eventStatus === 'draft') return 'draft'
  if (eventStatus === 'cancelled') return 'paused'
  return random.bool(0.85) ? 'on_sale' : random.pick(['draft', 'paused'] as const)
}

/* Re-exported so tests and the dashboard can assert against the allowed sets. */
export { CURRENCIES, EVENT_STATUSES, TICKET_STATUSES }
