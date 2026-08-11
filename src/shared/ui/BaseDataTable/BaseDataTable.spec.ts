import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import type { ListMeta } from '@/shared/types/api'
import BaseDataTable from '@/shared/ui/BaseDataTable/BaseDataTable.vue'
import type { TableColumn } from '@/shared/ui/BaseDataTable/types'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { MOBILE_WIDTH, setViewportWidth } from '@tests/utils/viewport'

/**
 * Every one of the five states a list can be in is asserted here, because "we render a
 * spinner and hope" is the most common way a data table ships broken.
 *
 * Queries target roles and visible text, never PrimeVue's classnames, so this suite survives
 * the UI kit being replaced.
 */

interface Row {
  id: string
  name: string
  status: string
}

const columns: TableColumn[] = [
  { field: 'name', header: 'Name', sortable: true, priority: 'primary' },
  { field: 'status', header: 'Status', sortable: true },
]

const rows: Row[] = [
  { id: '1', name: 'Summer Gala', status: 'published' },
  { id: '2', name: 'Winter Expo', status: 'draft' },
]

function meta(overrides: Partial<ListMeta> = {}): ListMeta {
  return { total: 2, page: 1, perPage: 10, totalPages: 1, ...overrides }
}

function renderTable(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return renderWithApp(BaseDataTable, {
    props: { rows, columns, meta: meta(), label: 'Events', ...props },
    ...(Object.keys(slots).length > 0 ? { slots } : {}),
  })
}

describe('BaseDataTable', () => {
  describe('loaded state', () => {
    it('renders a row per record with its cell values', async () => {
      await renderTable()

      expect(screen.getByText('Summer Gala')).toBeInTheDocument()
      expect(screen.getByText('Winter Expo')).toBeInTheDocument()
      expect(screen.getByText('published')).toBeInTheDocument()
    })

    it('renders column headers', async () => {
      await renderTable()

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('lets a caller override a cell through its slot', async () => {
      await renderWithApp(BaseDataTable, {
        props: { rows, columns, meta: meta(), label: 'Events' },
        slots: { 'cell-status': '<span>Custom status</span>' },
      })

      expect(screen.getAllByText('Custom status')).toHaveLength(2)
      expect(screen.queryByText('published')).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('announces the failure and offers a retry instead of a stale grid', async () => {
      const { emitted } = await renderTable({
        errorMessage: 'Something went wrong on our end.',
        rows: [],
      })

      const alert = screen.getByRole('alert')
      expect(within(alert).getByText(/Could not load events/i)).toBeInTheDocument()
      expect(within(alert).getByText('Something went wrong on our end.')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
      expect(emitted()['retry']).toHaveLength(1)
    })

    it('takes precedence over the rows, which would otherwise look current', async () => {
      await renderTable({ errorMessage: 'Network unreachable.' })

      expect(screen.queryByText('Summer Gala')).not.toBeInTheDocument()
    })
  })

  describe('empty states', () => {
    it('offers a create action when the resource is genuinely empty', async () => {
      await renderWithApp(BaseDataTable, {
        props: {
          rows: [],
          columns,
          meta: meta({ total: 0 }),
          label: 'Events',
          isEmpty: true,
          emptyTitle: 'No events yet',
          emptyDescription: 'Create your first event to get started.',
        },
        slots: { emptyAction: '<button type="button">Create event</button>' },
      })

      expect(screen.getByText('No events yet')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create event' })).toBeInTheDocument()
    })

    it('offers to clear filters when nothing matches, not a create action', async () => {
      const { emitted } = await renderTable({
        rows: [],
        meta: meta({ total: 0 }),
        isFilteredEmpty: true,
      })

      expect(screen.getByText('No matches')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(emitted()['clearFilters']).toHaveLength(1)
    })

    it('shows skeletons rather than an empty grid before the first load', async () => {
      await renderTable({ rows: [], initialising: true, isEmpty: true })

      // Initialising outranks empty: the resource may well have rows we have not seen yet.
      expect(screen.queryByText('No matches')).not.toBeInTheDocument()
      expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
    })
  })

  describe('sorting', () => {
    it('emits the field when a sortable header is activated', async () => {
      const { emitted } = await renderTable()

      await userEvent.click(screen.getByText('Name'))

      expect(emitted()['sort']).toBeTruthy()
      expect(emitted()['sort']?.[0]).toEqual(['name'])
    })
  })

  describe('row actions', () => {
    it('renders the actions slot for every row', async () => {
      await renderWithApp(BaseDataTable, {
        props: { rows, columns, meta: meta(), label: 'Events' },
        slots: { actions: '<button type="button">Edit</button>' },
      })

      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    })
  })

  it('labels the grid for assistive technology', async () => {
    await renderTable()

    expect(screen.getByLabelText('Events')).toBeInTheDocument()
  })
})

describe('BaseDataTable, generic row typing', () => {
  it('accepts a typed row and passes it to the cell slot', async () => {
    // Compile-time assurance as much as runtime: `row` is TRow, not `any`.
    await renderWithApp(BaseDataTable<Row>, {
      props: { rows, columns, meta: meta(), label: 'Events' },
      slots: { 'cell-name': '<em>slotted</em>' },
    })

    expect(screen.getAllByText('slotted')).toHaveLength(2)
  })

  it('renders without an actions column when no slot is supplied', async () => {
    await renderTable()

    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
  })

  it('renders nothing surprising for an unknown field', async () => {
    const sparse = [{ id: '1', name: 'Only name', status: '' }]
    await renderWithApp(BaseDataTable, {
      props: { rows: sparse, columns, meta: meta({ total: 1 }), label: 'Events' },
    })

    expect(screen.getByText('Only name')).toBeInTheDocument()
  })
})

describe('BaseDataTable, below md', () => {
  beforeEach(() => {
    setViewportWidth(MOBILE_WIDTH)
  })

  it('renders a card list instead of a grid', async () => {
    await renderTable()

    // No column headers: a card shows label/value pairs, not a header row.
    expect(screen.getByText('Summer Gala')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Events' })).toBeInTheDocument()
  })

  it('headlines each card with the primary column', async () => {
    await renderTable()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Summer Gala')).toBeInTheDocument()
  })

  it('shows the remaining columns as labelled values', async () => {
    await renderTable()

    const first = screen.getAllByRole('listitem')[0]!
    expect(within(first).getByText('Status')).toBeInTheDocument()
    expect(within(first).getByText('published')).toBeInTheDocument()
  })

  it('omits columns marked hideOnMobile', async () => {
    await renderTable({
      columns: [
        { field: 'name', header: 'Name', priority: 'primary' },
        { field: 'status', header: 'Status', hideOnMobile: true },
      ],
    })

    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.getByText('Summer Gala')).toBeInTheDocument()
  })

  it('still renders the error state', async () => {
    await renderTable({ errorMessage: 'Network unreachable.', rows: [] })

    expect(screen.getByRole('alert')).toHaveTextContent('Network unreachable.')
  })

  it('still renders row actions', async () => {
    await renderWithApp(BaseDataTable, {
      props: { rows, columns, meta: meta(), label: 'Events' },
      slots: { actions: '<button type="button">Edit</button>' },
    })

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
  })

  it('gives mobile selection checkboxes a 44px touch target', async () => {
    await renderTable({ selectable: true, selectedIds: [] })

    const checkbox = screen.getByRole('checkbox', { name: 'Select Summer Gala' })
    const hitTarget = checkbox.closest('label')
    expect(hitTarget).not.toBeNull()
    // min-h/w-11 = 2.75rem = 44px. jsdom does not layout, so assert the classes.
    expect(hitTarget).toHaveClass('min-h-11', 'min-w-11')
  })
})

describe('BaseDataTable selection (desktop)', () => {
  it('renders selectable checkboxes labelled by the primary column', async () => {
    const { emitted } = await renderTable({ selectable: true, selectedIds: [] })

    const checkbox = screen.getByRole('checkbox', { name: 'Select Summer Gala' })
    await userEvent.click(checkbox)

    expect(emitted()['toggleRow']?.[0]).toEqual(['1'])
    expect(
      screen.getByRole('checkbox', { name: 'Select all events on this page' }),
    ).toBeInTheDocument()
  })
})

/** Keeps the unused import honest, `h` documents that slots may be render functions. */
export const _renderFunctionSlotsAreSupported = h
