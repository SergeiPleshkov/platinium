import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import { http as mswHttp, HttpResponse } from 'msw'

import App from '@/app/App.vue'
import { useAuthStore } from '@/features/auth'
import { db } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Rearranging the dashboard tiles.
 *
 * Driven entirely through the **keyboard** path, and that is deliberate rather than a
 * concession to jsdom. HTML5 drag and drop has no keyboard equivalent, so if the arrow keys
 * do not work the feature simply does not exist for a portion of users, which makes it the
 * path most worth pinning. The pointer path shares `moveTo` with it and is covered in
 * `useSortableList.spec.ts`; the geometry was checked in a real browser.
 */

const STORAGE_KEY = 'app.dashboard.tileOrder'

/**
 * Every widget, figures *and* panels, in one arrangement.
 *
 * The panels were originally a separate grid with no handles, which meant a user could
 * rearrange the numbers but not push "Upcoming events" above them, the one rearrangement
 * somebody who cares more about their calendar than their totals would actually want.
 */
const DEFAULT_ORDER = [
  'Events',
  'Tickets',
  'Inventory',
  'Inventory value',
  'Upcoming events',
  'Busiest events',
]

async function openDashboard(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })
  await screen.findByRole('button', { name: /Reorder Events/ })

  return rendered
}

/**
 * Widget labels in the order they appear, read from the DOM rather than from state.
 *
 * Taken from each handle's accessible name, which is the one thing every widget has in common
 *, the figures render a `<dt>` and the panels an `<h2>`.
 */
function renderedOrder(): string[] {
  return [...document.querySelectorAll('[aria-label^="Reorder "]')].map(
    (handle) => /^Reorder (.+?),/.exec(handle.getAttribute('aria-label') ?? '')?.[1] ?? '',
  )
}

/**
 * The handle for one tile.
 *
 * Anchored on the em dash that follows the label, because "Reorder Inventory" is also a
 * prefix of "Reorder Inventory value", a plain `startsWith` matches two tiles.
 */
function handleFor(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Reorder ${label},`) })
}

beforeEach(() => {
  localStorage.clear()
})

describe('dashboard tile arrangement', () => {
  it('renders the tiles in their default order', async () => {
    await openDashboard()

    expect(renderedOrder()).toEqual(DEFAULT_ORDER)
  })

  it('gives every tile a drag handle that says where it currently is', async () => {
    await openDashboard()

    expect(handleFor('Events')).toHaveAccessibleName(
      'Reorder Events, currently 1 of 6. Use the arrow keys to move it.',
    )
  })

  describe('the keyboard path', () => {
    it('moves a tile later with ArrowRight', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(renderedOrder().slice(0, 2)).toEqual(['Tickets', 'Events'])
    })

    it('moves a tile earlier with ArrowLeft', async () => {
      await openDashboard()

      handleFor('Inventory').focus()
      await userEvent.keyboard('{ArrowLeft}')

      expect(renderedOrder().slice(0, 3)).toEqual(['Events', 'Inventory', 'Tickets'])
    })

    it('accepts the vertical arrows too, because the grid reflows', async () => {
      // One row at `xl`, two columns at `sm`, one below that, "next" is right *or* down.
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowDown}')

      expect(renderedOrder()[1]).toBe('Events')
    })

    it('does nothing at the start of the list', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowLeft}')

      // Clamped, not wrapped: an arrow at the edge should not teleport the tile to the end.
      expect(renderedOrder()).toEqual(DEFAULT_ORDER)
    })

    it('does nothing at the end of the list', async () => {
      await openDashboard()

      handleFor('Busiest events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(renderedOrder()).toEqual(DEFAULT_ORDER)
    })

    it('moves a panel, not just a figure', async () => {
      // The gap this feature had: the two panels rendered in a grid of their own, unhandled.
      await openDashboard()

      handleFor('Upcoming events').focus()
      await userEvent.keyboard('{ArrowLeft}')

      expect(renderedOrder()[3]).toBe('Upcoming events')
      expect(renderedOrder()[4]).toBe('Inventory value')
    })

    it('can lift a panel above every figure', async () => {
      await openDashboard()

      const handle = () => handleFor('Upcoming events')
      for (let step = 0; step < 4; step += 1) {
        handle().focus()
        await userEvent.keyboard('{ArrowLeft}')
      }

      expect(renderedOrder()[0]).toBe('Upcoming events')
    })

    it('ignores keys that are not arrows', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('x')

      expect(renderedOrder()).toEqual(DEFAULT_ORDER)
    })

    it('updates the handle to report the new position', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(handleFor('Events')).toHaveAccessibleName(
        'Reorder Events, currently 2 of 6. Use the arrow keys to move it.',
      )
    })
  })

  describe('announcements', () => {
    it('says what moved and where it went', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      // A tile sliding is self-evident to whoever can see it, and silent to everyone else.
      expect(screen.getByText('Events moved to position 2 of 6.')).toBeInTheDocument()
    })

    it('says nothing when the move was refused', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowLeft}')

      expect(screen.queryByText(/moved to position/)).not.toBeInTheDocument()
    })
  })

  describe('persistence', () => {
    it('stores the arrangement', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
        'tickets',
        'events',
        'inventory',
        'inventory-value',
        'upcoming-events',
        'busiest-events',
      ])
    })

    it('restores it on the next visit', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          'busiest-events',
          'upcoming-events',
          'inventory-value',
          'inventory',
          'tickets',
          'events',
        ]),
      )

      await openDashboard()

      expect(renderedOrder()).toEqual([...DEFAULT_ORDER].reverse())
    })

    it('shows a tile the stored order predates, rather than hiding it', async () => {
      // The arrangement of an earlier release must not suppress a tile added since.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['inventory', 'events']))

      await openDashboard()

      expect(renderedOrder()).toEqual([
        'Inventory',
        'Events',
        'Tickets',
        'Inventory value',
        'Upcoming events',
        'Busiest events',
      ])
    })

    it('survives a stored order full of ids that no longer exist', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['ancient', 'obsolete']))

      await openDashboard()

      expect(renderedOrder()).toEqual(DEFAULT_ORDER)
    })
  })

  describe('resetting', () => {
    it('offers no reset until the order has been changed', async () => {
      await openDashboard()

      expect(screen.queryByRole('button', { name: /Reset layout/ })).not.toBeInTheDocument()
    })

    it('offers a reset once it has', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: /Reset layout/ })).toBeInTheDocument()
    })

    it('restores the default order and clears the stored one', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      await userEvent.click(screen.getByRole('button', { name: /Reset layout/ }))

      await waitFor(() => expect(renderedOrder()).toEqual(DEFAULT_ORDER))
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('saving to the account', () => {
    /**
     * `localStorage` keeps a layout on *this* browser. Saving it against the account is what
     * makes it follow the person to another machine, which is the whole reason the endpoint
     * exists rather than the preference simply living in storage.
     */
    it('offers no save until something has changed', async () => {
      await openDashboard()

      expect(screen.queryByRole('button', { name: /Save layout/ })).not.toBeInTheDocument()
    })

    it('offers a save once the layout differs from the account', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: /Save layout/ })).toBeInTheDocument()
    })

    it('withdraws the save when the layout is dragged back to what was stored', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowLeft}')

      // Nothing to save. Offering the button would invite a pointless request and a
      // "saved" toast for a change that never happened.
      expect(screen.queryByRole('button', { name: /Save layout/ })).not.toBeInTheDocument()
    })

    it('persists the order against the account', async () => {
      const { pinia } = await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      await userEvent.click(screen.getByRole('button', { name: /Save layout/ }))

      await waitFor(() => {
        expect(useAuthStore(pinia).preferences.dashboardOrder?.[0]).toBe('tickets')
      })
      expect(db.users[0]?.preferences?.dashboardOrder?.[0]).toBe('tickets')
    })

    it('confirms the save, and says what it means', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      await userEvent.click(screen.getByRole('button', { name: /Save layout/ }))

      expect(await screen.findByText('Layout saved')).toBeInTheDocument()
      expect(
        screen.getByText('It will follow you to any browser you sign in from.'),
      ).toBeInTheDocument()
    })

    it('hides the save again once it has been saved', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')
      await userEvent.click(screen.getByRole('button', { name: /Save layout/ }))

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Save layout/ })).not.toBeInTheDocument()
      })
    })

    it('applies the account layout on a browser that has never seen it', async () => {
      // The claim the feature is for: a different machine, so nothing in `localStorage`.
      db.users[0]!.preferences = {
        dashboardOrder: [
          'busiest-events',
          'events',
          'tickets',
          'inventory',
          'inventory-value',
          'upcoming-events',
        ],
      }

      await openDashboard()

      await waitFor(() => expect(renderedOrder()[0]).toBe('Busiest events'))
    })

    it('reconciles a saved layout that predates a widget', async () => {
      db.users[0]!.preferences = { dashboardOrder: ['busiest-events', 'events'] }

      await openDashboard()

      await waitFor(() => expect(renderedOrder()[0]).toBe('Busiest events'))
      // The four it has never heard of still appear, rather than vanishing.
      expect(renderedOrder()).toHaveLength(6)
    })

    it('says so when the save fails, rather than pretending', async () => {
      server.use(
        mswHttp.patch(`${window.location.origin}/api/me/preferences`, () =>
          HttpResponse.json({ message: 'Storage is full.' }, { status: 500 }),
        ),
      )
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      await userEvent.click(screen.getByRole('button', { name: /Save layout/ }))

      expect(await screen.findByText('Storage is full.')).toBeInTheDocument()
      // Still offered, because there is still something unsaved.
      expect(screen.getByRole('button', { name: /Save layout/ })).toBeInTheDocument()
    })
  })

  it('still shows the figures it is meant to show', async () => {
    // The rearranging must not have cost the page its actual job.
    await openDashboard()

    // `findBy`, because the detail line only renders once the stats have arrived.
    expect(await screen.findByText('Tickets remaining across all events')).toBeInTheDocument()
    expect(document.querySelectorAll('dl')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Upcoming events' })).toBeInTheDocument()
  })
})
