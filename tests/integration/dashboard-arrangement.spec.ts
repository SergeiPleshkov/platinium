import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Rearranging the dashboard tiles.
 *
 * Driven entirely through the **keyboard** path, and that is deliberate rather than a
 * concession to jsdom. HTML5 drag and drop has no keyboard equivalent, so if the arrow keys
 * do not work the feature simply does not exist for a portion of users — which makes it the
 * path most worth pinning. The pointer path shares `moveTo` with it and is covered in
 * `useSortableList.spec.ts`; the geometry was checked in a real browser.
 */

const STORAGE_KEY = 'app.dashboard.tileOrder'
const DEFAULT_ORDER = ['Events', 'Tickets', 'Inventory', 'Inventory value']

async function openDashboard(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), 'admin@ticketing.test')
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })
  await screen.findByRole('button', { name: /Reorder Events/ })

  return rendered
}

/** Tile labels in the order they appear, read from the DOM rather than from state. */
function renderedOrder(): string[] {
  return [...document.querySelectorAll('dl dt')].map(
    (term) => term.textContent?.trim().split('\n')[0]?.trim() ?? '',
  )
}

/**
 * The handle for one tile.
 *
 * Anchored on the em dash that follows the label, because "Reorder Inventory" is also a
 * prefix of "Reorder Inventory value" — a plain `startsWith` matches two tiles.
 */
function handleFor(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Reorder ${label} —`) })
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
      'Reorder Events — currently 1 of 4. Use the arrow keys to move it.',
    )
  })

  describe('the keyboard path', () => {
    it('moves a tile later with ArrowRight', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(renderedOrder()).toEqual(['Tickets', 'Events', 'Inventory', 'Inventory value'])
    })

    it('moves a tile earlier with ArrowLeft', async () => {
      await openDashboard()

      handleFor('Inventory').focus()
      await userEvent.keyboard('{ArrowLeft}')

      expect(renderedOrder()).toEqual(['Events', 'Inventory', 'Tickets', 'Inventory value'])
    })

    it('accepts the vertical arrows too, because the grid reflows', async () => {
      // One row at `xl`, two columns at `sm`, one below that — "next" is right *or* down.
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

      handleFor('Inventory value').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(renderedOrder()).toEqual(DEFAULT_ORDER)
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
        'Reorder Events — currently 2 of 4. Use the arrow keys to move it.',
      )
    })
  })

  describe('announcements', () => {
    it('says what moved and where it went', async () => {
      await openDashboard()

      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      // A tile sliding is self-evident to whoever can see it, and silent to everyone else.
      expect(screen.getByText('Events moved to position 2 of 4.')).toBeInTheDocument()
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
      ])
    })

    it('restores it on the next visit', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['inventory-value', 'inventory', 'tickets', 'events']),
      )

      await openDashboard()

      expect(renderedOrder()).toEqual([...DEFAULT_ORDER].reverse())
    })

    it('shows a tile the stored order predates, rather than hiding it', async () => {
      // The arrangement of an earlier release must not suppress a tile added since.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['inventory', 'events']))

      await openDashboard()

      expect(renderedOrder()).toEqual(['Inventory', 'Events', 'Tickets', 'Inventory value'])
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

      expect(screen.queryByRole('button', { name: /Reset tile order/ })).not.toBeInTheDocument()
    })

    it('offers a reset once it has', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: /Reset tile order/ })).toBeInTheDocument()
    })

    it('restores the default order and clears the stored one', async () => {
      await openDashboard()
      handleFor('Events').focus()
      await userEvent.keyboard('{ArrowRight}')

      await userEvent.click(screen.getByRole('button', { name: /Reset tile order/ }))

      await waitFor(() => expect(renderedOrder()).toEqual(DEFAULT_ORDER))
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  it('still shows the figures it is meant to show', async () => {
    // The rearranging must not have cost the page its actual job.
    await openDashboard()

    // `findBy`, because the detail line only renders once the stats have arrived.
    expect(await screen.findByText('Tickets remaining across all events')).toBeInTheDocument()
    expect(document.querySelectorAll('dl')).toHaveLength(4)
  })
})
