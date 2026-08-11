import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { http as mswHttp, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { useTicketsStore } from '@/features/tickets'
import { db } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Optimistic status changes, and the rollback that makes them safe to ship.
 *
 * Two claims, and the second is the one that matters. Showing the change immediately is easy;
 * *undoing* it when the server refuses is the part that gets forgotten, and its failure mode
 * is silent, the screen goes on confidently displaying a value that was rejected, and
 * nothing about the page looks broken.
 */

const ORIGIN = window.location.origin

async function openTickets(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })

  await rendered.router.push('/tickets')
  await screen.findByRole('heading', { name: 'Tickets' })
  await waitFor(() => {
    expect(document.querySelector('tbody tr')?.textContent?.trim()).toBeTruthy()
  })

  return rendered
}

/** Holds the PATCH open, so the optimistic state can be observed before it resolves. */
function stallUpdates(): { release: () => void } {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  server.use(
    mswHttp.patch(`${ORIGIN}/api/tickets/:id`, async () => {
      await gate
      return HttpResponse.json({ message: 'Rejected by the test.' }, { status: 500 })
    }),
  )

  return { release }
}

beforeEach(() => {
  localStorage.clear()
})

describe('optimistic status changes', () => {
  it('offers the status as an inline control, not a dialog', async () => {
    const { pinia } = await openTickets()
    const first = useTicketsStore(pinia).items[0]!

    expect(screen.getByLabelText(`Status for ${first.name}`)).toBeInTheDocument()
  })

  it('shows the new status before the server has answered', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!
    const { release } = stallUpdates()

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')

    // The request is still in flight, held open by the stall above.
    expect(store.items.find((ticket) => ticket.id === target.id)?.status).toBe('paused')
    release()
  })

  it('restores the previous status when the server refuses', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!
    const original = target.status
    const { release } = stallUpdates()

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')
    release()

    await waitFor(() => {
      expect(store.items.find((ticket) => ticket.id === target.id)?.status).toBe(original)
    })
  })

  it('says so, rather than reverting silently', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!
    const { release } = stallUpdates()

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')
    release()

    /*
     * The *server's* message, not the page's fallback: `fromError` prefers what the API said,
     * because "Rejected by the test." explains more than "Could not change the status" does.
     * The fallback is for failures that never reached the server.
     */
    expect(await screen.findByText('Rejected by the test.')).toBeInTheDocument()
  })

  it('puts the control back to the restored value, not the attempted one', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!
    const original = target.status
    const { release } = stallUpdates()

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')
    release()

    await waitFor(() => {
      const control = screen.getByLabelText(`Status for ${target.name}`)
      expect((control as HTMLSelectElement).value).toBe(original)
    })
  })

  it('keeps the change and persists it when the server agrees', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')

    await waitFor(() => {
      expect(db.tickets.find((ticket) => ticket.id === target.id)?.status).toBe('paused')
    })
    expect(store.items.find((ticket) => ticket.id === target.id)?.status).toBe('paused')
  })

  it('raises no toast on success, the row already said it', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items.find((ticket) => ticket.status !== 'paused')!

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), 'paused')
    await waitFor(() => {
      expect(db.tickets.find((ticket) => ticket.id === target.id)?.status).toBe('paused')
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores a change to the status the row already has', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    const target = store.items[0]!
    let patches = 0
    server.use(
      mswHttp.patch(`${ORIGIN}/api/tickets/:id`, () => {
        patches += 1
        return HttpResponse.json(target)
      }),
    )

    await userEvent.selectOptions(screen.getByLabelText(`Status for ${target.name}`), target.status)

    expect(patches).toBe(0)
  })

  it('gives a viewer a badge rather than a control', async () => {
    const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await userEvent.type(await screen.findByLabelText(/Email address/), 'viewer@ticketing.test')
    await userEvent.type(screen.getByLabelText(/Password/), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
    await screen.findByRole('heading', { name: 'Dashboard' })
    await rendered.router.push('/tickets')
    await screen.findByRole('heading', { name: 'Tickets' })

    const store = useTicketsStore(rendered.pinia)
    await waitFor(() => expect(store.items.length).toBeGreaterThan(0))

    expect(screen.queryByLabelText(/^Status for /)).not.toBeInTheDocument()
  })
})
