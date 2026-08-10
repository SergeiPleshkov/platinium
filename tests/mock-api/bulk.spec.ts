import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/mocks/db'
import { BULK_LIMIT, type BulkResult } from '@/shared/types/bulk'
import { post, signIn } from '@tests/utils/apiClient'

/**
 * The bulk endpoint's contract.
 *
 * The claim worth proving is **partial success**: ten deletes where three are blocked report
 * seven successes and three explained refusals, and the seven really happened. A transaction
 * would be defensible for a real database, but it turns "three of these have tickets" into
 * "nothing happened", and the admin then has to find the three by hand.
 */

let admin: string
let editor: string
let viewer: string

beforeEach(async () => {
  admin = await signIn('admin@ticketing.test')
  editor = await signIn('editor@ticketing.test')
  viewer = await signIn('viewer@ticketing.test')
})

/** Ids of tickets that exist, for a delete that should wholly succeed. */
function ticketIds(count: number): string[] {
  return db.tickets.slice(0, count).map((ticket) => ticket.id)
}

describe('mock API — bulk operations', () => {
  describe('delete', () => {
    it('removes every id when none is blocked', async () => {
      const ids = ticketIds(5)
      const before = db.tickets.length

      const response = await post<BulkResult>('/api/tickets/bulk', { action: 'delete', ids }, admin)

      expect(response.status).toBe(200)
      expect(response.body.succeeded).toHaveLength(5)
      expect(response.body.failed).toEqual([])
      expect(db.tickets).toHaveLength(before - 5)
    })

    it('reports 207 and per-record reasons on a partial failure', async () => {
      /*
       * The scenario the whole design exists for: a mix of categories, some free to delete and
       * some still holding tickets.
       */
      const blocked = db.categories.filter((category) => category.ticketCount > 0).slice(0, 2)
      const free = await post<{ id: string }>(
        '/api/categories',
        { name: 'Free To Delete', description: '' },
        admin,
      )
      const ids = [...blocked.map((category) => category.id), free.body.id]

      const response = await post<BulkResult>(
        '/api/categories/bulk',
        { action: 'delete', ids },
        admin,
      )

      expect(response.status).toBe(207)
      expect(response.body.succeeded).toEqual([free.body.id])
      expect(response.body.failed).toHaveLength(2)
    })

    it('actually performs the successful half of a partial failure', async () => {
      const blocked = db.categories.find((category) => category.ticketCount > 0)!
      const free = await post<{ id: string }>(
        '/api/categories',
        { name: 'Doomed', description: '' },
        admin,
      )

      await post(
        '/api/categories/bulk',
        {
          action: 'delete',
          ids: [blocked.id, free.body.id],
        },
        admin,
      )

      // Seven successes are not undone by three refusals.
      expect(db.categories.some((category) => category.id === free.body.id)).toBe(false)
      expect(db.categories.some((category) => category.id === blocked.id)).toBe(true)
    })

    it('explains each refusal in words the UI can show verbatim', async () => {
      const blocked = db.categories.find((category) => category.ticketCount > 0)!

      const response = await post<BulkResult>(
        '/api/categories/bulk',
        { action: 'delete', ids: [blocked.id] },
        admin,
      )

      expect(response.body.failed[0]?.reason).toMatch(/Still has \d+ ticket/)
    })

    it('reports an unknown id as a refusal rather than failing the request', async () => {
      const response = await post<BulkResult>(
        '/api/tickets/bulk',
        { action: 'delete', ids: ['tkt_does_not_exist'] },
        admin,
      )

      expect(response.status).toBe(207)
      expect(response.body.failed[0]).toMatchObject({ reason: 'No longer exists.' })
    })

    it('collapses duplicate ids instead of reporting the second as missing', async () => {
      const [id] = ticketIds(1)

      const response = await post<BulkResult>(
        '/api/tickets/bulk',
        { action: 'delete', ids: [id!, id!] },
        admin,
      )

      expect(response.status).toBe(200)
      expect(response.body.succeeded).toEqual([id])
    })

    it('keeps denormalised counts correct afterwards', async () => {
      const event = db.events.find((candidate) => candidate.ticketCount > 1)!
      const ids = db.tickets
        .filter((ticket) => ticket.eventId === event.id)
        .slice(0, 2)
        .map((ticket) => ticket.id)
      const before = event.ticketCount

      await post('/api/tickets/bulk', { action: 'delete', ids }, admin)

      expect(db.events.find((candidate) => candidate.id === event.id)?.ticketCount).toBe(before - 2)
    })
  })

  describe('status', () => {
    it('applies one status to every selected record', async () => {
      const ids = ticketIds(4)

      const response = await post<BulkResult>(
        '/api/tickets/bulk',
        { action: 'status', ids, status: 'paused' },
        admin,
      )

      expect(response.status).toBe(200)
      for (const id of ids) {
        expect(db.tickets.find((ticket) => ticket.id === id)?.status).toBe('paused')
      }
    })

    it('rejects a status the entity does not have, before changing anything', async () => {
      const ids = ticketIds(3)
      const before = db.tickets.find((ticket) => ticket.id === ids[0])?.status

      const response = await post<{ message: string }>(
        '/api/tickets/bulk',
        { action: 'status', ids, status: 'banana' },
        admin,
      )

      expect(response.status).toBe(422)
      expect(db.tickets.find((ticket) => ticket.id === ids[0])?.status).toBe(before)
    })

    it('requires a status to be given', async () => {
      const response = await post(
        '/api/tickets/bulk',
        { action: 'status', ids: ticketIds(1) },
        admin,
      )
      expect(response.status).toBe(422)
    })

    it('is refused for an entity with no status', async () => {
      const response = await post(
        '/api/categories/bulk',
        { action: 'status', ids: [db.categories[0]!.id], status: 'draft' },
        admin,
      )

      expect(response.status).toBe(422)
    })
  })

  describe('permissions', () => {
    it('is not a back door around the single-record delete rule', async () => {
      // An editor cannot DELETE /tickets/:id, so they must not be able to bulk-delete either.
      const response = await post(
        '/api/tickets/bulk',
        { action: 'delete', ids: ticketIds(2) },
        editor,
      )

      expect(response.status).toBe(403)
      expect(db.tickets.filter((ticket) => ticketIds(2).includes(ticket.id))).toHaveLength(2)
    })

    it('lets an editor change status, which they may do one at a time', async () => {
      const response = await post(
        '/api/tickets/bulk',
        { action: 'status', ids: ticketIds(2), status: 'paused' },
        editor,
      )

      expect(response.status).toBe(200)
    })

    it('refuses a viewer entirely', async () => {
      const response = await post(
        '/api/tickets/bulk',
        { action: 'status', ids: ticketIds(1), status: 'paused' },
        viewer,
      )

      expect(response.status).toBe(403)
    })

    it('requires a session', async () => {
      const response = await post('/api/tickets/bulk', { action: 'delete', ids: ticketIds(1) })
      expect(response.status).toBe(401)
    })
  })

  describe('request validation', () => {
    it('rejects an empty selection', async () => {
      const response = await post('/api/tickets/bulk', { action: 'delete', ids: [] }, admin)
      expect(response.status).toBe(422)
    })

    it('caps the batch size', async () => {
      const ids = Array.from({ length: BULK_LIMIT + 1 }, (_unused, index) => `tkt_${index}`)
      const response = await post('/api/tickets/bulk', { action: 'delete', ids }, admin)

      expect(response.status).toBe(422)
    })

    it('rejects an unknown action', async () => {
      const response = await post('/api/tickets/bulk', { action: 'incinerate', ids: ['x'] }, admin)
      expect(response.status).toBe(400)
    })

    it('rejects ids that are not strings', async () => {
      const response = await post('/api/tickets/bulk', { action: 'delete', ids: [1, 2] }, admin)
      expect(response.status).toBe(400)
    })
  })
})
