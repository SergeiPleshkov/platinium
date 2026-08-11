import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { signInViaUi } from '@tests/utils/signInViaUi'

/**
 * CSV import, driven through the dialog with real `File` objects.
 *
 * The endpoint's behaviour is covered in `tests/mock-api/import.spec.ts`. What these add is
 * the flow: that nothing is written until the admin has seen the report, that the report says
 * which line is wrong, and that a file the application *exported* can be fed straight back in.
 */

function csvFile(body: string, name = 'tickets.csv'): File {
  return new File([body], name, { type: 'text/csv' })
}

const HEADER = 'Name,Event,Category,Price (minor units),Currency,Quantity,Status'

function row(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    name: 'Imported Tier',
    event: db.events[0]!.name,
    category: db.categories[0]!.name,
    price: '2500',
    currency: 'EUR',
    quantity: '100',
    status: 'draft',
    ...overrides,
  }
  // Quote the relation names: real event names contain spaces and can contain commas.
  return `${values.name},"${values.event}","${values.category}",${values.price},${values.currency},${values.quantity},${values.status}`
}

async function openImportDialog(): Promise<HTMLElement> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
  await signInViaUi()

  await rendered.router.push('/tickets')
  await screen.findByRole('heading', { name: 'Tickets' })

  await userEvent.click(screen.getByRole('button', { name: /Import CSV/ }))
  return screen.findByRole('dialog')
}

async function upload(dialog: HTMLElement, body: string): Promise<void> {
  await userEvent.upload(within(dialog).getByLabelText(/CSV file/), csvFile(body))
}

beforeEach(() => {
  localStorage.clear()
})

describe('CSV import', () => {
  it('offers the import action beside the export', async () => {
    await openImportDialog()

    expect(screen.getByRole('dialog', { name: /Import tickets/ })).toBeInTheDocument()
  })

  it('previews a clean file without importing anything', async () => {
    const dialog = await openImportDialog()
    const before = db.tickets.length

    await upload(dialog, `${HEADER}\r\n${row()}\r\n${row()}\r\n`)

    expect(await within(dialog).findByText('2 of 2 rows are ready to import')).toBeInTheDocument()
    expect(within(dialog).getByText('No problems found.')).toBeInTheDocument()
    // The whole point of a preview.
    expect(db.tickets).toHaveLength(before)
  })

  it('imports on confirmation', async () => {
    const dialog = await openImportDialog()
    const before = db.tickets.length

    await upload(dialog, `${HEADER}\r\n${row()}\r\n${row()}\r\n`)
    await within(dialog).findByText('2 of 2 rows are ready to import')
    await userEvent.click(within(dialog).getByRole('button', { name: /Import 2 tickets/ }))

    await waitFor(() => expect(db.tickets).toHaveLength(before + 2))
    expect(await screen.findByText('2 tickets imported')).toBeInTheDocument()
  })

  it('shows the imported rows in the table afterwards', async () => {
    const dialog = await openImportDialog()

    await upload(dialog, `${HEADER}\r\n${row({ name: 'Balcony Restricted View' })}\r\n`)
    await within(dialog).findByText('1 of 1 rows are ready to import')
    await userEvent.click(within(dialog).getByRole('button', { name: /Import 1 tickets/ }))

    // A refresh, because a new row may belong anywhere under the current sort.
    expect(await screen.findByText('Balcony Restricted View')).toBeInTheDocument()
  })

  describe('a file with problems', () => {
    it('names the line and the column', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `${HEADER}\r\n${row()}\r\n${row({ currency: 'XYZ' })}\r\n`)

      const report = await within(dialog).findByText(/1 of 2 rows are ready to import/)
      expect(report).toBeInTheDocument()
      // Line 3 is where a spreadsheet shows the second data row.
      expect(within(dialog).getByText(/Line 3/)).toBeInTheDocument()
    })

    it('explains an unknown event in the file’s own words', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `${HEADER}\r\n${row({ event: 'Glastonbury 1971' })}\r\n`)

      expect(
        await within(dialog).findByText(/No event named “Glastonbury 1971”/),
      ).toBeInTheDocument()
    })

    it('still offers to import the rows that are fine', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `${HEADER}\r\n${row()}\r\n${row({ quantity: 'lots' })}\r\n`)
      await within(dialog).findByText('1 of 2 rows are ready to import')

      expect(within(dialog).getByRole('button', { name: /Import 1 tickets/ })).toBeEnabled()
    })

    it('refuses to import when nothing is valid', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `${HEADER}\r\n${row({ event: 'Nope' })}\r\n`)
      await within(dialog).findByText('0 of 1 rows are ready to import')

      expect(within(dialog).getByRole('button', { name: /Import 0 tickets/ })).toBeDisabled()
    })

    it('rejects a file with no data rows', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `${HEADER}\r\n`)

      expect(await within(dialog).findByText('That file has no data rows.')).toBeInTheDocument()
    })
  })

  describe('files that have been through a spreadsheet', () => {
    it('accepts columns in a different order', async () => {
      const dialog = await openImportDialog()
      const reordered = 'Status,Quantity,Currency,Price (minor units),Category,Event,Name'
      const line = `draft,100,EUR,2500,"${db.categories[0]!.name}","${db.events[0]!.name}",Reordered`

      await upload(dialog, `${reordered}\r\n${line}\r\n`)

      // Position is the one thing about a CSV nobody preserves.
      expect(await within(dialog).findByText('1 of 1 rows are ready to import')).toBeInTheDocument()
    })

    it('accepts a leading BOM and CRLF endings', async () => {
      const dialog = await openImportDialog()

      await upload(dialog, `\ufeff${HEADER}\r\n${row()}\r\n`)

      expect(await within(dialog).findByText('1 of 1 rows are ready to import')).toBeInTheDocument()
    })

    it('accepts the ID and Created columns the export adds', async () => {
      const dialog = await openImportDialog()
      const exported = `ID,${HEADER},Created`
      const line = `tkt_001,${row()},2026-01-01T00:00:00.000Z`

      await upload(dialog, `${exported}\r\n${line}\r\n`)

      // Otherwise a round trip fails on the very file this application produced.
      expect(await within(dialog).findByText('1 of 1 rows are ready to import')).toBeInTheDocument()
    })
  })

  it('forgets the previous report when reopened', async () => {
    const dialog = await openImportDialog()
    await upload(dialog, `${HEADER}\r\n${row()}\r\n`)
    await within(dialog).findByText('1 of 1 rows are ready to import')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /Import CSV/ }))

    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).queryByText(/rows are ready to import/)).not.toBeInTheDocument()
  })

  it('is not offered to a viewer', async () => {
    const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signInViaUi('viewer@ticketing.test')
    await rendered.router.push('/tickets')
    await screen.findByRole('heading', { name: 'Tickets' })

    expect(screen.queryByRole('button', { name: /Import CSV/ })).not.toBeInTheDocument()
  })
})
