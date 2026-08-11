import type { User } from '@/features/auth/types'
import type { Category } from '@/features/categories/types'
import type { Event } from '@/features/events/types'
import type { Ticket } from '@/features/tickets/types'
import { SEED_NOW, SEED_USERS, buildCategories, buildEvents, buildTickets } from '@/mocks/fixtures'
import { sequentialId } from '@/mocks/fixtures/random'

/**
 * The mock backend's in-memory database.
 *
 * It behaves like a real one in the ways that matter for the client: it owns ids and
 * timestamps, it maintains derived counts, and it enforces referential integrity. Handlers
 * never mutate these arrays directly. They go through the helpers below, so the invariants
 * hold no matter which endpoint is called.
 */

export interface MockDatabase {
  categories: Category[]
  events: Event[]
  tickets: Ticket[]
  users: User[]
  /** token → user id. */
  sessions: Map<string, string>
}

const sequences = { cat: 0, evt: 0, tkt: 0, tok: 0 }

export const db: MockDatabase = {
  categories: [],
  events: [],
  tickets: [],
  users: [],
  sessions: new Map(),
}

/**
 * Restores pristine seed data. Called once at startup and between every test, so no spec can
 * be affected by what another spec created or deleted.
 */
export function resetDb(): void {
  const categories = buildCategories()
  const events = buildEvents()

  db.categories = categories
  db.events = events
  db.tickets = buildTickets(events, categories)
  db.users = SEED_USERS.map((user) => ({ ...user }))
  db.sessions = new Map()

  sequences.cat = categories.length
  sequences.evt = events.length
  sequences.tkt = db.tickets.length
  sequences.tok = 0

  syncDerivedCounts()
}

/**
 * Recomputes the denormalised `ticketCount` on events and categories.
 *
 * The client relies on these to show usage in list views and to explain why an event cannot
 * be deleted. Recomputing centrally after every ticket mutation is cheap at this scale and
 * removes a whole class of "the counter drifted" bug.
 */
export function syncDerivedCounts(): void {
  const byEvent = new Map<string, number>()
  const byCategory = new Map<string, number>()

  for (const ticket of db.tickets) {
    byEvent.set(ticket.eventId, (byEvent.get(ticket.eventId) ?? 0) + 1)
    byCategory.set(ticket.categoryId, (byCategory.get(ticket.categoryId) ?? 0) + 1)
  }

  for (const event of db.events) {
    event.ticketCount = byEvent.get(event.id) ?? 0
  }
  for (const category of db.categories) {
    category.ticketCount = byCategory.get(category.id) ?? 0
  }
}

export function nextId(prefix: 'cat' | 'evt' | 'tkt'): string {
  sequences[prefix] += 1
  return sequentialId(prefix, sequences[prefix], prefix === 'tkt' ? 4 : 3)
}

export function nextToken(): string {
  sequences.tok += 1
  return `mock-token-${sequences.tok}`
}

/**
 * "Now", as the mock server sees it.
 *
 * Records created during a session get a real current timestamp so they sort to the top of a
 * newest-first list, which is what an admin expects after creating something. The *seed* data
 * is anchored to `SEED_NOW` instead, so it never drifts.
 */
export function nowIso(): string {
  return new Date().toISOString()
}

export { SEED_NOW }

// Seed immediately so importing the handlers is enough to have a working backend.
resetDb()
