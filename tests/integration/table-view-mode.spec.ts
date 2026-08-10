import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { useTicketsStore } from '@/features/tickets'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { MOBILE_WIDTH, setViewportWidth } from '@tests/utils/viewport'

/**
 * Switching between paginated and virtual rendering, end to end.
 *
 * jsdom has no layout, so PrimeVue's scroller never virtualises and never emits a range —
 * the geometry (row height, DOM row count, honest scrollbar) was verified in a real browser
 * instead, and the per-page bookkeeping is covered by `useVirtualRows.spec.ts`.
 *
 * What *is* testable here, and what actually breaks in a refactor, is the wiring: that the
 * switch reaches the store, that the two modes fill different state, that the paginator
 * disappears with the pages, and that switching does not lose the query.
 */

async function openTickets(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })

  await rendered.router.push('/tickets')
  await screen.findByRole('heading', { name: 'Tickets' })

  return rendered
}

async function switchTo(label: 'Pages' | 'Virtual'): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: label }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('pagination ↔ virtual scrolling', () => {
  it('offers the switch above the table, defaulting to pages', async () => {
    await openTickets()

    expect(screen.getByRole('radiogroup', { name: 'Row rendering strategy' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Pages' })).toBeChecked()
  })

  it('fills the paginated page and leaves the buffer empty in pages mode', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)

    await waitFor(() => expect(store.items).toHaveLength(10))
    expect(store.buffer).toEqual([])
  })

  it('builds a buffer the size of the whole result set in virtual mode', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)
    await waitFor(() => expect(store.items).toHaveLength(10))

    await switchTo('Virtual')

    // 250 slots from one 10-row request: the scrollbar is honest before the rows exist.
    await waitFor(() => expect(store.buffer).toHaveLength(db.tickets.length))
    expect(store.buffer.filter((row) => !('__pending' in row))).toHaveLength(10)
  })

  it('drops the paginator, because the scrollbar is the position indicator', async () => {
    await openTickets()
    expect(await screen.findByLabelText('Page 1')).toBeInTheDocument()

    await switchTo('Virtual')

    await waitFor(() => expect(screen.queryByLabelText('Page 1')).not.toBeInTheDocument())
  })

  it('restores the paginator on the way back', async () => {
    await openTickets()

    await switchTo('Virtual')
    await waitFor(() => expect(screen.queryByLabelText('Page 1')).not.toBeInTheDocument())
    await switchTo('Pages')

    expect(await screen.findByLabelText('Page 1')).toBeInTheDocument()
  })

  it('keeps the active filter when the mode changes', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)

    await userEvent.type(screen.getByLabelText(/Search tickets/), 'Premium')
    await waitFor(() => expect(store.meta.total).toBeLessThan(db.tickets.length))
    const filteredTotal = store.meta.total

    await switchTo('Virtual')

    // Switching how rows are drawn must not change which rows they are.
    await waitFor(() => expect(store.buffer).toHaveLength(filteredTotal))
  })

  it('empties the buffer when the query changes, rather than mixing result sets', async () => {
    const { pinia } = await openTickets()
    const store = useTicketsStore(pinia)

    await switchTo('Virtual')
    await waitFor(() => expect(store.buffer).toHaveLength(db.tickets.length))

    await userEvent.type(screen.getByLabelText(/Search tickets/), 'Premium')

    await waitFor(() => {
      expect(store.buffer.length).toBeLessThan(db.tickets.length)
      expect(store.buffer.length).toBe(store.meta.total)
    })
  })

  it('persists the choice across a remount', async () => {
    await openTickets()
    await switchTo('Virtual')

    expect(localStorage.getItem('app.table.viewMode')).toBe('virtual')
  })

  it('hides the switch below md, where the grid is a card list', async () => {
    // Offering a control that silently does nothing is worse than offering none.
    setViewportWidth(MOBILE_WIDTH)
    await openTickets()

    expect(
      screen.queryByRole('radiogroup', { name: 'Row rendering strategy' }),
    ).not.toBeInTheDocument()
  })
})
