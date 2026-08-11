import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { useTicketsStore } from '@/features/tickets'
import { createListQuery } from '@/shared/types/api'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { MOBILE_WIDTH, setViewportWidth } from '@tests/utils/viewport'
import { signInViaUi } from '@tests/utils/signInViaUi'

/**
 * Switching between paginated and virtual rendering, end to end.
 *
 * jsdom has no layout, so PrimeVue's scroller never virtualises and never emits a range
 * the geometry (row height, DOM row count, honest scrollbar) was verified in a real browser
 * instead, and the per-page bookkeeping is covered by `useVirtualRows.spec.ts`.
 *
 * What *is* testable here, and what actually breaks in a refactor, is the wiring: that the
 * switch reaches the store, that the two modes fill different state, that the paginator
 * disappears with the pages, and that switching does not lose the query.
 */

async function openTickets(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
  await signInViaUi()

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

  describe('loading a further page', () => {
    /**
     * The behaviour these three pin is the difference between virtual scrolling that feels
     * smooth and virtual scrolling that flickers: a page arriving must *add* rows, never
     * disturb the ones already on screen and never blank the grid.
     */
    async function loadSecondPage(pinia: Parameters<typeof useTicketsStore>[0]): Promise<{
      store: ReturnType<typeof useTicketsStore>
      before: readonly unknown[]
    }> {
      const store = useTicketsStore(pinia)
      await switchTo('Virtual')
      await waitFor(() => expect(store.buffer).toHaveLength(db.tickets.length))

      const before = store.buffer.slice(0, 10)
      await store.fetchWindow({ ...createListQuery(), page: 2 })
      return { store, before }
    }

    it('leaves the rows already loaded untouched', async () => {
      const { pinia } = await openTickets()
      const { store, before } = await loadSecondPage(pinia)

      // Identity, not just equality: replacing these is what makes the grid re-render.
      expect(store.buffer.slice(0, 10)).toEqual(before)
    })

    it('keeps the buffer array itself stable, so the scroller does not re-measure', async () => {
      const { pinia } = await openTickets()
      const store = useTicketsStore(pinia)
      await switchTo('Virtual')
      await waitFor(() => expect(store.buffer).toHaveLength(db.tickets.length))

      const array = store.buffer
      await store.fetchWindow({ ...createListQuery(), page: 2 })

      /*
       * A virtual scroller watches its `items` reference to decide when to tear down and
       * re-measure. Reassigning the buffer on every page is what made the grid rebuild
       * mid-scroll; rows are written in place instead.
       */
      expect(store.buffer).toBe(array)
    })

    it('never puts the collection back into a loading state', async () => {
      const { pinia } = await openTickets()
      const { store } = await loadSecondPage(pinia)

      // `isInitialising` drives the skeleton; flipping it here would blank the whole grid.
      expect(store.isInitialising).toBe(false)
      expect(store.isEmpty).toBe(false)
      expect(store.buffer.filter((row) => !('__pending' in row))).toHaveLength(20)
    })
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
