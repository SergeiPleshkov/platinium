import { beforeEach, describe, expect, it } from 'vitest'

import type { DashboardStats } from '@/features/dashboard/types'
import { db } from '@/mocks/db'
import type { ApiErrorBody } from '@/shared/types/api'
import { get, signIn } from '@tests/utils/apiClient'

/**
 * The aggregation contract.
 *
 * These assertions recompute each figure from the database independently, so the endpoint is
 * checked against the data rather than against itself.
 */

let token: string

beforeEach(async () => {
  token = await signIn()
})

describe('mock API — dashboard stats', () => {
  it('requires authentication', async () => {
    expect((await get<ApiErrorBody>('/api/stats')).status).toBe(401)
  })

  it('counts events, categories and tickets', async () => {
    const { body } = await get<DashboardStats>('/api/stats', token)

    expect(body.events.total).toBe(db.events.length)
    expect(body.categories.total).toBe(db.categories.length)
    expect(body.tickets.total).toBe(db.tickets.length)
  })

  it('counts published events', async () => {
    const { body } = await get<DashboardStats>('/api/stats', token)

    expect(body.events.published).toBe(
      db.events.filter((event) => event.status === 'published').length,
    )
  })

  it('counts only future, non-cancelled events as upcoming', async () => {
    const { body } = await get<DashboardStats>('/api/stats', token)

    const expected = db.events.filter(
      (event) => Date.parse(event.startDate) > Date.now() && event.status !== 'cancelled',
    ).length

    expect(body.events.upcoming).toBe(expected)
  })

  it('totals remaining inventory across every ticket', async () => {
    const { body } = await get<DashboardStats>('/api/stats', token)

    const expected = db.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
    expect(body.tickets.inventory).toBe(expected)
  })

  describe('inventory value', () => {
    it('groups by currency and never sums across them', async () => {
      const { body } = await get<DashboardStats>('/api/stats', token)

      const expected = new Map<string, number>()
      for (const ticket of db.tickets) {
        expected.set(
          ticket.currency,
          (expected.get(ticket.currency) ?? 0) + ticket.priceMinor * ticket.quantity,
        )
      }

      expect(body.inventoryValue).toHaveLength(expected.size)
      for (const entry of body.inventoryValue) {
        expect(entry.totalMinor).toBe(expected.get(entry.currency))
      }
    })

    it('returns integer minor units, never a float major amount', async () => {
      const { body } = await get<DashboardStats>('/api/stats', token)

      expect(body.inventoryValue.every((entry) => Number.isInteger(entry.totalMinor))).toBe(true)
    })
  })

  describe('leaderboards', () => {
    it('returns the five busiest events, in descending order', async () => {
      const { body } = await get<DashboardStats>('/api/stats', token)

      expect(body.busiestEvents).toHaveLength(5)
      const counts = body.busiestEvents.map((entry) => entry.ticketCount)
      expect(counts).toEqual([...counts].sort((a, b) => b - a))

      const highest = Math.max(...db.events.map((event) => event.ticketCount))
      expect(counts[0]).toBe(highest)
    })

    it('returns upcoming events soonest-first, capped at five', async () => {
      const { body } = await get<DashboardStats>('/api/stats', token)

      expect(body.upcomingEvents.length).toBeLessThanOrEqual(5)
      const dates = body.upcomingEvents.map((event) => Date.parse(event.startDate))
      expect(dates).toEqual([...dates].sort((a, b) => a - b))
      expect(dates.every((date) => date > Date.now())).toBe(true)
    })
  })

  it('reflects a mutation on the next request', async () => {
    const before = (await get<DashboardStats>('/api/stats', token)).body.categories.total

    db.categories.pop()

    const after = (await get<DashboardStats>('/api/stats', token)).body.categories.total
    expect(after).toBe(before - 1)
  })
})
