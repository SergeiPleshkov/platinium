import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { useTicketsStore } from '@/features/tickets'
import { post, signIn } from '@tests/utils/apiClient'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Bulk actions, through the UI.
 *
 * `tests/mock-api/bulk.spec.ts` proves the endpoint reports per record. This proves the half
 * that is easy to get wrong in the client: that a partial success is presented as *neither* a
 * success nor a failure, and that the selection behaves sensibly around a changing query.
 */

async function openTickets(role = 'admin'): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), `${role}@ticketing.test`)
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

/** Ticks the first `count` row checkboxes. */
async function selectRows(count: number): Promise<void> {
  const boxes = screen
    .getAllByRole('checkbox')
    .filter((box) => box.getAttribute('aria-label')?.startsWith('Select row'))

  for (const box of boxes.slice(0, count)) {
    await userEvent.click(box)
  }
}

/**
 * Finds an option inside the open dropdown overlay.
 *
 * Scoped to the `listbox` deliberately: the table's inline status controls are native
 * `<select>` elements whose `<option>`s also carry the `option` role, so an unscoped query
 * matches a dozen rows as well as the dropdown.
 */
async function findOverlayOption(name: string): Promise<HTMLElement> {
  const listbox = await screen.findByRole('listbox')
  return within(listbox).getByRole('option', { name })
}

beforeEach(() => {
  localStorage.clear()
})

describe('bulk actions', () => {
  it('offers no bulk bar until something is selected', async () => {
    await openTickets()

    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('shows the bar and the count once rows are ticked', async () => {
    await openTickets()
    await selectRows(3)

    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(within(bar).getByText('3 tickets selected')).toBeInTheDocument()
  })

  it('uses the singular for one row', async () => {
    await openTickets()
    await selectRows(1)

    expect(screen.getByText('1 ticket selected')).toBeInTheDocument()
  })

  it('selects every visible row from the header checkbox', async () => {
    await openTickets()

    await userEvent.click(screen.getByRole('checkbox', { name: /Select all tickets/ }))

    // The page, not the whole 250-row result set, the user can only see ten.
    expect(screen.getByText('10 tickets selected')).toBeInTheDocument()
  })

  it('clears the selection on demand', async () => {
    await openTickets()
    await selectRows(2)

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('drops the selection when the query changes', async () => {
    await openTickets()
    await selectRows(2)
    expect(screen.getByText('2 tickets selected')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Search tickets/), 'Premium')

    /*
     * Ticking rows and then filtering to a different set would leave those ids selected but
     * invisible, and the next "delete selected" would hit records nobody can see.
     */
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
    })
  })

  describe('bulk status change', () => {
    it('applies one status to every selected ticket', async () => {
      const { pinia } = await openTickets()
      const store = useTicketsStore(pinia)
      await selectRows(3)
      const ids = store.items.slice(0, 3).map((ticket) => ticket.id)

      await userEvent.click(screen.getByLabelText('Set status for selected'))
      await userEvent.click(await findOverlayOption('Paused'))
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

      await waitFor(() => {
        for (const id of ids) {
          expect(db.tickets.find((ticket) => ticket.id === id)?.status).toBe('paused')
        }
      })
    })

    it('reports the change and clears the selection', async () => {
      await openTickets()
      await selectRows(2)

      await userEvent.click(screen.getByLabelText('Set status for selected'))
      await userEvent.click(await findOverlayOption('Paused'))
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

      expect(await screen.findByText('2 tickets updated')).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
      })
    })

    it('cannot apply until a status is chosen', async () => {
      await openTickets()
      await selectRows(1)

      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    })
  })

  describe('bulk delete', () => {
    it('confirms before destroying anything', async () => {
      const before = db.tickets.length
      await openTickets()
      await selectRows(2)

      await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(db.tickets).toHaveLength(before)
    })

    it('names the number at risk in the confirmation', async () => {
      await openTickets()
      await selectRows(3)
      await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/3 tickets will be permanently deleted/)).toBeInTheDocument()
    })

    it('deletes them once confirmed', async () => {
      const before = db.tickets.length
      await openTickets()
      await selectRows(2)

      await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete tickets' }))

      await waitFor(() => expect(db.tickets).toHaveLength(before - 2))
      expect(await screen.findByText('2 tickets deleted')).toBeInTheDocument()
    })
  })

  describe('records the server refuses', () => {
    /**
     * Categories are the entity with a refusal rule worth hitting: one holding tickets cannot
     * be deleted, so a selection produces genuine per-record reasons rather than a generic
     * failure. Every seeded category has tickets, which is what makes the *total* case easy
     * and the *partial* case something the test has to arrange.
     */
    async function openCategories(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
      const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
      await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
      await userEvent.type(screen.getByLabelText(/Password/), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
      await screen.findByRole('heading', { name: 'Dashboard' })

      await rendered.router.push('/categories')
      await screen.findByRole('heading', { name: 'Categories' })
      // Any loaded row: seeding an extra category can push a named one onto page two.
      await waitFor(() => {
        expect(document.querySelector('tbody tr')?.textContent?.trim()).toBeTruthy()
      })
      return rendered
    }

    /** Selects every visible row, then confirms the bulk delete. */
    async function deleteAllVisible(): Promise<void> {
      await userEvent.click(screen.getByRole('checkbox', { name: /Select all categories/ }))
      await userEvent.click(screen.getByRole('button', { name: /Delete selected/ }))

      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete categories' }))
    }

    /** The report, named so it is not confused with the error toast, both are alerts. */
    function report(): HTMLElement {
      return screen.getByRole('alert', { name: 'Bulk action failures' })
    }

    it('lists each refusal with its reason, on screen', async () => {
      await openCategories()
      await deleteAllVisible()

      // Not a toast: this is a list to be read, and a toast would take it away mid-sentence.
      await waitFor(() => expect(report()).toBeInTheDocument())
      expect(within(report()).getByText(/could not be changed/)).toBeInTheDocument()
      expect(within(report()).getAllByText(/Still has \d+ ticket/).length).toBeGreaterThan(0)
    })

    it('names the records that failed, not just their ids', async () => {
      await openCategories()
      await deleteAllVisible()

      await waitFor(() => expect(report()).toBeInTheDocument())
      expect(within(report()).getByText('VIP')).toBeInTheDocument()
    })

    it('can be dismissed', async () => {
      await openCategories()
      await deleteAllVisible()
      await waitFor(() => expect(report()).toBeInTheDocument())

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss failure report' }))

      expect(screen.queryByRole('alert', { name: 'Bulk action failures' })).not.toBeInTheDocument()
    })

    it('keeps the selection when nothing at all succeeded', async () => {
      await openCategories()
      await deleteAllVisible()
      await waitFor(() => expect(report()).toBeInTheDocument())

      // Nothing changed, so re-ticking ten rows to try again would be busywork.
      expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()
    })

    describe('when only some are refused', () => {
      /*
       * Every seeded category holds tickets, so a genuinely partial outcome has to be
       * arranged: one deletable row among ten blocked ones. Named to sort first so it lands
       * on the page the test can see.
       */
      async function seedDeletableCategory(): Promise<void> {
        const token = await signIn('admin@ticketing.test')
        await post('/api/categories', { name: 'AAA Deletable', description: '' }, token)
      }

      it('reports the successes and the refusals together', async () => {
        await seedDeletableCategory()
        await openCategories()
        const before = db.categories.length

        await deleteAllVisible()

        await waitFor(() => expect(report()).toBeInTheDocument())
        // One went; the rest were explained. Neither half is hidden by the other.
        expect(db.categories).toHaveLength(before - 1)
        expect(within(report()).getByText(/could not be changed/)).toBeInTheDocument()
      })

      it('clears the selection, because part of it no longer exists', async () => {
        await seedDeletableCategory()
        await openCategories()

        await deleteAllVisible()

        await waitFor(() => expect(report()).toBeInTheDocument())
        expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
      })
    })
  })

  describe('permissions', () => {
    it('offers an editor status changes but not deletion', async () => {
      await openTickets('editor')
      await selectRows(2)

      const bar = screen.getByRole('region', { name: 'Bulk actions' })
      expect(within(bar).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
      expect(within(bar).queryByRole('button', { name: /Delete selected/ })).not.toBeInTheDocument()
    })

    it('gives a viewer no checkboxes at all', async () => {
      await openTickets('viewer')

      expect(screen.queryAllByRole('checkbox', { name: /Select row/ })).toHaveLength(0)
    })
  })
})
