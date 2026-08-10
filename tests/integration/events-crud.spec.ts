import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { http as mswHttp, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { server } from '@/mocks/server'
import { renderWithApp } from '@tests/utils/renderWithApp'

/** The events journey, through the router, against the real mock backend. */

async function openEvents(path = '/events'): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })

  await rendered.router.push(path)
  await screen.findByRole('heading', { name: 'Events' })

  return rendered
}

beforeEach(() => {
  localStorage.clear()
})

describe('events', () => {
  it('lists events with their date range and status', async () => {
    await openEvents()

    // Seeded names are "<Prefix> <Subject> <City>".
    expect(
      await screen.findByText(/Music Festival|Tech Conference|Design Summit/),
    ).toBeInTheDocument()
    // Dates render as a formatted range, never a raw ISO string.
    expect(screen.queryByText(/T\d{2}:\d{2}:\d{2}/)).not.toBeInTheDocument()
  })

  it('shows a status badge per row', async () => {
    await openEvents()
    await screen.findByRole('heading', { name: 'Events' })

    const badges = await screen.findAllByText(/^(Draft|Published|Cancelled|Completed)$/)
    expect(badges.length).toBeGreaterThan(0)
  })

  it('filters by status, server-side, and keeps it in the URL', async () => {
    const { router } = await openEvents('/events?status=cancelled')

    await waitFor(() => {
      expect(router.currentRoute.value.query['status']).toBe('cancelled')
    })

    // Every visible status badge is the one filtered for.
    await waitFor(() => {
      expect(screen.queryByText('Published')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
  })

  it('creates an event', async () => {
    await openEvents()
    await screen.findByRole('heading', { name: 'Events' })

    await userEvent.click(screen.getByRole('button', { name: 'New event' }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Integration Test Gala')
    await userEvent.type(within(dialog).getByLabelText(/Venue/), 'Test Arena')

    // Country is a select backed by the server's distinct-country endpoint.
    await userEvent.click(within(dialog).getByLabelText(/Country/))
    await userEvent.click(await screen.findByRole('option', { name: 'France' }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create event' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    /*
     * The default sort is start date ascending and the new event is dated 2027, so it is on
     * the last page rather than the first. Search for it instead of assuming it is visible —
     * which also proves the create actually reached the server.
     */
    await userEvent.type(screen.getByLabelText('Search events'), 'Integration Test Gala')
    expect(await screen.findByText('Integration Test Gala')).toBeInTheDocument()
  })

  it('maps a server-side field error onto the field that caused it', async () => {
    /*
     * The date-range rule itself is covered where it is enforced: the schema unit tests, the
     * mock-API tests and the store tests. It cannot be reproduced through this dialog because
     * the end picker carries `min` = the start date, so the invalid value is unreachable —
     * which is the point of the guard rail.
     *
     * What this covers instead is the path that only exists here: a 422 the client could not
     * have predicted, projected back onto the right field rather than shown as a toast.
     */
    server.use(
      mswHttp.post(`${window.location.origin}/api/events`, () =>
        HttpResponse.json(
          {
            message: 'Some of the details are not valid.',
            errors: { venue: 'That venue is already booked for these dates' },
          },
          { status: 422 },
        ),
      ),
    )

    await openEvents()
    await screen.findByRole('heading', { name: 'Events' })

    await userEvent.click(screen.getByRole('button', { name: 'New event' }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Double Booked')
    await userEvent.type(within(dialog).getByLabelText(/Venue/), 'Accor Arena')
    await userEvent.click(within(dialog).getByLabelText(/Country/))
    await userEvent.click(await screen.findByRole('option', { name: 'France' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create event' }))

    expect(
      await within(dialog).findByText('That venue is already booked for these dates'),
    ).toBeInTheDocument()
    // The dialog stays open so the admin can correct it.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edits an event', async () => {
    await openEvents()
    const firstEdit = (await screen.findAllByRole('button', { name: /^Edit / }))[0]!
    await userEvent.click(firstEdit)

    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText(/Name/)
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Renamed By Test')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Renamed By Test')).toBeInTheDocument()
  })

  it('explains in the dialog why an event with tickets cannot be deleted', async () => {
    await openEvents()
    const firstDelete = (await screen.findAllByRole('button', { name: /^Delete / }))[0]!
    await userEvent.click(firstDelete)

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete event' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/still has \d+ ticket/i)
  })

  it('sorts by a column and reflects it in the URL', async () => {
    const { router } = await openEvents()
    await screen.findByRole('heading', { name: 'Events' })

    await userEvent.click(screen.getByText('Venue'))

    await waitFor(() => {
      expect(router.currentRoute.value.query['sort']).toBe('venue')
    })
  })

  it('offers to clear filters when a search matches nothing', async () => {
    await openEvents()
    await screen.findByRole('heading', { name: 'Events' })

    await userEvent.type(screen.getByLabelText('Search events'), 'zzz-no-such-event')

    expect(await screen.findByText('No matches')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('No matches')).not.toBeInTheDocument()
    })
  })
})
