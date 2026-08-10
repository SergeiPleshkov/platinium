import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/mocks/db'
import { call, signIn } from '@tests/utils/apiClient'

/**
 * The export contract.
 *
 * The claim being tested is specific: the file contains every row matching the *current
 * query*, not the current page — which is the difference between an export that is useful and
 * one that quietly hands over ten rows out of two hundred and fifty.
 */

let token: string

async function fetchCsv(query = ''): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(`${window.location.origin}/api/tickets/export?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return { status: response.status, text: await response.text(), headers: response.headers }
}

/** Data rows only — drops the BOM+header line and the trailing blank. */
function dataRows(csv: string): string[] {
  return csv.split('\r\n').slice(1).filter(Boolean)
}

beforeEach(async () => {
  token = await signIn()
})

describe('mock API — ticket CSV export', () => {
  it('requires authentication', async () => {
    const response = await fetch(`${window.location.origin}/api/tickets/export`)
    expect(response.status).toBe(401)
  })

  it('serves a downloadable CSV, not JSON', async () => {
    const { status, headers } = await fetchCsv()

    expect(status).toBe(200)
    expect(headers.get('content-type')).toContain('text/csv')
    expect(headers.get('content-disposition')).toMatch(
      /attachment; filename="tickets-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it('exports every matching row, not the page size', async () => {
    // The list endpoint caps perPage at 100; the export is not bound by it.
    const { text } = await fetchCsv('perPage=10')

    expect(dataRows(text)).toHaveLength(db.tickets.length)
    expect(db.tickets.length).toBe(250)
  })

  it('honours the filters the table is showing', async () => {
    const event = db.events.find((candidate) => candidate.ticketCount > 0)!
    const { text } = await fetchCsv(`eventId=${event.id}`)

    const rows = dataRows(text)
    expect(rows).toHaveLength(event.ticketCount)
    expect(rows.every((row) => row.includes(event.name))).toBe(true)
  })

  it('honours search as well as filters', async () => {
    const expected = db.tickets.filter((ticket) => ticket.status === 'sold_out').length
    const { text } = await fetchCsv('status=sold_out')

    expect(dataRows(text)).toHaveLength(expected)
  })

  it('honours the sort order', async () => {
    const { text } = await fetchCsv('sort=priceMinor&order=asc')

    const prices = dataRows(text).map((row) => Number(row.split(',')[4]))
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('writes a header row naming every column', async () => {
    const { text } = await fetchCsv('perPage=1')
    const header = text.split('\r\n')[0]!

    for (const column of ['Name', 'Event', 'Category', 'Currency', 'Quantity', 'Status']) {
      expect(header).toContain(column)
    }
  })

  it('exports price as a number plus a currency column, not a formatted string', async () => {
    const { text } = await fetchCsv('perPage=1')
    const header = text.split('\r\n')[0]!
    const first = dataRows(text)[0]!.split(',')

    // A spreadsheet can compute on 2550; it cannot compute on "€25.50".
    expect(header).toContain('Price (minor units)')
    expect(Number.isInteger(Number(first[4]))).toBe(true)
    expect(['EUR', 'USD', 'GBP']).toContain(first[5])
  })

  it('starts with a UTF-8 BOM so Excel reads accented venue names correctly', async () => {
    /*
     * Read as bytes, not text: `Response.text()` performs a UTF-8 decode, which strips a
     * leading BOM by specification — asserting on the decoded string would test nothing and
     * pass whether or not the BOM was ever sent.
     */
    const response = await fetch(`${window.location.origin}/api/tickets/export?perPage=1`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const bytes = new Uint8Array(await response.arrayBuffer())

    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('returns a header-only file when nothing matches', async () => {
    const { text } = await fetchCsv('search=zzz-no-such-ticket')

    expect(dataRows(text)).toHaveLength(0)
    expect(text.split('\r\n')[0]).toContain('Name')
  })

  it('is filtered identically to the list endpoint', async () => {
    // The two must not diverge: they share one query config for exactly this reason.
    const query = 'status=on_sale&sort=name&order=asc'
    const list = await call<{ meta: { total: number } }>(`/api/tickets?${query}&perPage=1`, {
      token,
    })
    const { text } = await fetchCsv(query)

    expect(dataRows(text)).toHaveLength(list.body.meta.total)
  })
})
