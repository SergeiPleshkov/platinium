import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { signInViaUi } from '@tests/utils/signInViaUi'

/**
 * The tickets journey, the relational slice, and the one the 250-row dataset exists for.
 */

async function openTickets(path = '/tickets'): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
  await signInViaUi()

  await rendered.router.push(path)
  await screen.findByRole('heading', { name: 'Tickets' })

  return rendered
}

/**
 * Waits for *loaded* rows, not merely rendered ones.
 *
 * The table renders skeleton rows while initialising, so counting `tbody tr` is satisfied
 * before any data arrives, an assertion against those reads every cell as an empty string
 * and quietly measures nothing.
 */
async function waitForLoadedRows(): Promise<void> {
  await waitFor(() => {
    const first = document.querySelector('tbody tr')
    expect(first?.textContent?.trim()).toBeTruthy()
  })
}

/**
 * Reads one column's cells by its *header*, not by position.
 *
 * Indexing `row.children[3]` broke the moment a selection checkbox column was added in front
 * of it, and it would have broken silently if the neighbouring column happened to contain
 * something that also matched. Resolving through the header keeps these tests about the data.
 */
function columnCells(header: string): string[] {
  const headers = [...document.querySelectorAll('thead th')]
  const index = headers.findIndex((cell) => cell.textContent?.trim().startsWith(header))
  expect(index).toBeGreaterThanOrEqual(0)

  return [...document.querySelectorAll('tbody tr')].map(
    (row) => row.children[index]?.textContent?.trim() ?? '',
  )
}

/**
 * The first option in the open dropdown overlay.
 *
 * Scoped to the `listbox`: the table's inline status controls are native `<select>` elements,
 * and their `<option>`s carry the same role, so an unscoped query picks a table row.
 */
async function firstOverlayOption(): Promise<HTMLElement> {
  const listbox = await screen.findByRole('listbox')
  return within(listbox).getAllByRole('option')[0]!
}

beforeEach(() => {
  localStorage.clear()
})

describe('tickets', () => {
  it('shows relation names rather than ids', async () => {
    await openTickets()
    await screen.findByRole('heading', { name: 'Tickets' })

    // An id leaking into a cell is the failure this slice is designed to avoid.
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/^evt_\d+$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^cat_\d+$/)).not.toBeInTheDocument()
  })

  it('formats prices as money, not raw minor units', async () => {
    await openTickets()
    await waitForLoadedRows()

    // Every price cell carries a currency symbol; none is a bare integer of cents.
    const cells = columnCells('Price')
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((text) => /[€$£]/.test(text))).toBe(true)
  })

  it('pages through a 250-row collection without loading it all', async () => {
    await openTickets()
    await waitForLoadedRows()

    // 250 rows exist; 10 are rendered.
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(db.tickets).toHaveLength(250)
  })

  it('filters by event, server-side, and keeps it in the URL', async () => {
    const event = db.events[0]!
    const { router } = await openTickets(`/tickets?eventId=${event.id}`)

    await waitFor(() => {
      expect(router.currentRoute.value.query['eventId']).toBe(event.id)
    })

    await waitForLoadedRows()

    // Every visible row belongs to the filtered event.
    const eventCells = columnCells('Event')
    expect(eventCells.every((text) => text === event.name)).toBe(true)
  })

  it('creates a ticket against an event and category', async () => {
    await openTickets()
    await screen.findByRole('heading', { name: 'Tickets' })

    await userEvent.click(screen.getByRole('button', { name: 'New ticket' }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Integration Test Tier')

    await userEvent.click(within(dialog).getByLabelText(/Event/))
    await userEvent.click(await firstOverlayOption())

    await userEvent.click(within(dialog).getByLabelText(/Category/))
    await userEvent.click(await firstOverlayOption())

    const priceField = within(dialog).getByLabelText(/Price/)
    await userEvent.clear(priceField)
    await userEvent.type(priceField, '42.50')

    const quantityField = within(dialog).getByLabelText(/Quantity/)
    await userEvent.clear(quantityField)
    await userEvent.type(quantityField, '250')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Newest first is the default sort, so it lands on page 1.
    expect(await screen.findByText('Integration Test Tier')).toBeInTheDocument()

    // 42.50 must have been stored as 4250 minor units, not 42.5 or 4250.0000001.
    const created = db.tickets.find((ticket) => ticket.name === 'Integration Test Tier')
    expect(created?.priceMinor).toBe(4250)
    expect(created?.quantity).toBe(250)
  })

  it('rejects an empty name before sending anything', async () => {
    await openTickets()
    await screen.findByRole('heading', { name: 'Tickets' })

    await userEvent.click(screen.getByRole('button', { name: 'New ticket' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }))

    expect(await within(dialog).findByText('Enter a ticket name')).toBeInTheDocument()
    expect(
      await within(dialog).findByText('Choose the event this ticket belongs to'),
    ).toBeInTheDocument()
  })

  it('edits a ticket', async () => {
    await openTickets()
    const firstEdit = (await screen.findAllByRole('button', { name: /^Edit / }))[0]!
    await userEvent.click(firstEdit)

    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText(/^Name/)
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Renamed Tier')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Renamed Tier')).toBeInTheDocument()
  })

  it('deletes a ticket after confirmation', async () => {
    await openTickets()
    const firstDelete = (await screen.findAllByRole('button', { name: /^Delete / }))[0]!
    const targetName = firstDelete.getAttribute('aria-label')!.replace('Delete ', '')

    await userEvent.click(firstDelete)
    const dialog = await screen.findByRole('dialog')
    // The prompt names the ticket and its event, not a generic "are you sure?".
    expect(within(dialog).getByText(new RegExp(targetName.slice(0, 12)))).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete ticket' }))

    await waitFor(() => {
      expect(db.tickets).toHaveLength(249)
    })
  })

  it('offers to clear filters when nothing matches', async () => {
    await openTickets()
    await screen.findByRole('heading', { name: 'Tickets' })

    await userEvent.type(screen.getByLabelText('Search tickets'), 'zzz-no-such-ticket')

    expect(await screen.findByText('No matches')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => {
      expect(screen.queryByText('No matches')).not.toBeInTheDocument()
    })
  })
})
