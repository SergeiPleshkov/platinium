import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/mocks/db'
import type { ImportResult } from '@/shared/types/import'
import { post, signIn } from '@tests/utils/apiClient'

/**
 * The import endpoint.
 *
 * The two claims worth proving: **a dry run reports exactly what a commit would do and writes
 * nothing**, and **valid rows are imported even when others are not**. The first is what makes
 * the preview trustworthy; the second is what makes the feature usable on the files that
 * actually need it, which are the ones with a few bad rows in them.
 */

let admin: string
let editor: string
let viewer: string

beforeEach(async () => {
  admin = await signIn('admin@ticketing.test')
  editor = await signIn('editor@ticketing.test')
  viewer = await signIn('viewer@ticketing.test')
})

/** A row that will validate, built from records that really exist. */
function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    name: 'Imported Tier',
    event: db.events[0]!.name,
    category: db.categories[0]!.name,
    'price (minor units)': '2500',
    currency: 'EUR',
    quantity: '100',
    status: 'draft',
    ...overrides,
  }
}

function runImport(
  rows: Array<Record<string, string>>,
  dryRun: boolean,
  token = admin,
): Promise<{ status: number; body: ImportResult }> {
  return post<ImportResult>('/api/tickets/import', { rows, dryRun }, token)
}

describe('mock API, ticket import', () => {
  describe('a dry run', () => {
    it('accepts a well-formed row', async () => {
      const { body } = await runImport([validRow()], true)

      expect(body).toMatchObject({ total: 1, accepted: 1, dryRun: true })
      expect(body.errors).toEqual([])
    })

    it('writes nothing', async () => {
      const before = db.tickets.length
      await runImport([validRow(), validRow(), validRow()], true)

      // The whole basis of showing a preview before committing.
      expect(db.tickets).toHaveLength(before)
    })

    it('reports the same outcome the commit then produces', async () => {
      const rows = [validRow(), validRow({ event: 'No Such Event' })]

      const dry = await runImport(rows, true)
      const wet = await runImport(rows, false)

      expect(wet.body.accepted).toBe(dry.body.accepted)
      expect(wet.body.errors).toEqual(dry.body.errors)
    })
  })

  describe('committing', () => {
    it('creates the accepted rows', async () => {
      const before = db.tickets.length
      const { body } = await runImport([validRow(), validRow()], false)

      expect(body.accepted).toBe(2)
      expect(db.tickets).toHaveLength(before + 2)
    })

    it('imports the good rows even when others are bad', async () => {
      const before = db.tickets.length

      const { body } = await runImport(
        [validRow(), validRow({ quantity: 'lots' }), validRow()],
        false,
      )

      // Rejecting 900 good rows over 3 bad ones makes the feature useless on real files.
      expect(body.accepted).toBe(2)
      expect(db.tickets).toHaveLength(before + 2)
    })

    it('keeps denormalised counts correct', async () => {
      const event = db.events[0]!
      const before = event.ticketCount

      await runImport([validRow(), validRow()], false)

      expect(db.events.find((candidate) => candidate.id === event.id)?.ticketCount).toBe(before + 2)
    })
  })

  describe('per-row reporting', () => {
    it('numbers rows by their line in the file, header included', async () => {
      const { body } = await runImport([validRow(), validRow({ currency: 'XYZ' })], true)

      // The second data row is line 3 in a spreadsheet, which is where the user will look.
      expect(body.errors[0]?.line).toBe(3)
    })

    it('names the column as the *file* spells it, not as the schema does', async () => {
      const { body } = await runImport([validRow({ currency: 'XYZ' })], true)

      // The user is about to open this file in a spreadsheet; `currency` is not a heading there.
      expect(body.errors[0]).toMatchObject({ field: 'Currency' })
    })

    it('translates every schema field back to its column heading', async () => {
      const { body } = await runImport([validRow({ status: 'nonsense', name: '' })], true)

      const fields = body.errors.map((error) => error.field)
      expect(fields).toContain('Status')
      expect(fields).toContain('Name')
      expect(fields.some((field) => field === 'priceMinor')).toBe(false)
    })

    it('explains an unknown event by name', async () => {
      const { body } = await runImport([validRow({ event: 'Glastonbury 1971' })], true)

      expect(body.errors[0]).toMatchObject({
        field: 'Event',
        reason: 'No event named “Glastonbury 1971”.',
      })
    })

    it('explains an unknown category by name', async () => {
      const { body } = await runImport([validRow({ category: 'Royal Box' })], true)

      expect(body.errors[0]?.reason).toContain('No category named')
    })

    it('reports a missing relation as required rather than as not found', async () => {
      const { body } = await runImport([validRow({ event: '' })], true)

      expect(body.errors[0]?.reason).toBe('Event is required.')
    })

    it.each([
      ['not a number', 'quantity', 'lots'],
      ['a decimal where an integer is required', 'price (minor units)', '25.50'],
      ['scientific notation', 'quantity', '1e3'],
    ])('rejects %s', async (_case, column, value) => {
      const { body } = await runImport([validRow({ [column]: value })], true)

      expect(body.accepted).toBe(0)
      expect(body.errors.length).toBeGreaterThan(0)
    })

    it('reports every problem in a row, not just the first', async () => {
      const { body } = await runImport(
        [validRow({ event: 'Nope', category: 'Also nope', name: '' })],
        true,
      )

      // Fixing one error at a time across three round trips is not a workflow.
      expect(body.errors.length).toBeGreaterThanOrEqual(3)
    })

    it('does not report the same problem twice in different words', async () => {
      // Relation and number failures are described in the file's vocabulary; the schema's
      // duplicate complaints about the same fields are suppressed.
      const { body } = await runImport([validRow({ event: 'Nope' })], true)

      expect(body.errors.filter((error) => error.field === 'Event')).toHaveLength(1)
      expect(body.errors.some((error) => error.field === 'eventId')).toBe(false)
    })
  })

  describe('tolerance for files that have been through a spreadsheet', () => {
    it('matches an event name case-insensitively', async () => {
      const { body } = await runImport(
        [validRow({ event: db.events[0]!.name.toUpperCase() })],
        true,
      )

      expect(body.accepted).toBe(1)
    })

    it('accepts a lower-case currency', async () => {
      const { body } = await runImport([validRow({ currency: 'eur' })], true)

      expect(body.accepted).toBe(1)
    })

    it('accepts a status written with a space instead of an underscore', async () => {
      const { body } = await runImport([validRow({ status: 'On Sale' })], true)

      expect(body.accepted).toBe(1)
    })

    it('ignores the ID and Created columns the export includes', async () => {
      // Otherwise a round trip would fail on the very file this application produced.
      const { body } = await runImport(
        [validRow({ id: 'tkt_999', created: '2026-01-01T00:00:00.000Z' })],
        true,
      )

      expect(body.accepted).toBe(1)
    })
  })

  describe('permissions and validation', () => {
    it('lets an editor import', async () => {
      const { status } = await runImport([validRow()], true, editor)
      expect(status).toBe(200)
    })

    it('refuses a viewer', async () => {
      const { status } = await runImport([validRow()], false, viewer)
      expect(status).toBe(403)
    })

    it('requires a session', async () => {
      const response = await post('/api/tickets/import', { rows: [validRow()], dryRun: true })
      expect(response.status).toBe(401)
    })

    it('rejects an empty file', async () => {
      const response = await post('/api/tickets/import', { rows: [], dryRun: true }, admin)
      expect(response.status).toBe(422)
    })

    it('rejects a malformed request', async () => {
      const response = await post('/api/tickets/import', { rows: 'nope' }, admin)
      expect(response.status).toBe(400)
    })
  })
})
