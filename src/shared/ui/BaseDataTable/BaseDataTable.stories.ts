import type { StoryObj } from '@storybook/vue3-vite'

import BaseDataTable from '@/shared/ui/BaseDataTable/BaseDataTable.vue'
import type { TableColumn } from '@/shared/ui/BaseDataTable/types'

/**
 * The table every list page renders through.
 *
 * It is presentational: it holds no query state and talks to no store. Sorting and paging
 * are emitted upward, `useTable` owns them, and the store owns the rows. That split is why
 * the four states below can be shown from props alone.
 *
 * Below `md` it swaps the grid for stacked cards. Resize the preview to see it; horizontally
 * scrolling a table on a phone is not a responsive table.
 */

interface EventRow {
  id: string
  name: string
  venue: string
  country: string
  status: string
}

const COLUMNS: TableColumn[] = [
  { field: 'name', header: 'Event', sortable: true },
  { field: 'venue', header: 'Venue' },
  { field: 'country', header: 'Country', sortable: true },
  { field: 'status', header: 'Status' },
]

const ROWS: EventRow[] = [
  {
    id: 'evt_001',
    name: 'Summer Music Festival Paris',
    venue: 'Accor Arena',
    country: 'France',
    status: 'Published',
  },
  {
    id: 'evt_002',
    name: 'Winter Art Biennale Amsterdam',
    venue: 'Ziggo Dome',
    country: 'Netherlands',
    status: 'Published',
  },
  {
    id: 'evt_003',
    name: 'Nordic Design Summit Munich',
    venue: 'Olympiahalle',
    country: 'Germany',
    status: 'Draft',
  },
]

const meta = {
  title: 'Data/BaseDataTable',
  component: BaseDataTable,
  tags: ['autodocs'],
  args: {
    label: 'Events',
    columns: COLUMNS,
    rows: ROWS,
    meta: { total: 3, page: 1, perPage: 10, totalPages: 1 },
  },
}

export default meta
type Story = StoryObj<typeof BaseDataTable>

export const Loaded: Story = {}

export const Sorted: Story = {
  args: { sortField: 'name', sortOrder: 'asc' },
}

/**
 * `initialising` means loading with nothing to show yet, so the skeleton stands in for rows
 * that have never arrived. It is a different state from `loading`, which refreshes something
 * already on screen and must not blank it.
 */
export const Initialising: Story = {
  args: { initialising: true, rows: [], meta: { total: 0, page: 1, perPage: 10, totalPages: 1 } },
}

export const Empty: Story = {
  args: {
    rows: [],
    isEmpty: true,
    meta: { total: 0, page: 1, perPage: 10, totalPages: 1 },
    emptyTitle: 'No events yet',
    emptyDescription: 'Create an event and it will show up here.',
  },
}

/**
 * A filtered list matching nothing is deliberately not the same state as an empty one. The
 * way out is to clear the filters, not to create a record.
 */
export const NoResultsForFilters: Story = {
  args: {
    rows: [],
    isFilteredEmpty: true,
    meta: { total: 0, page: 1, perPage: 10, totalPages: 1 },
  },
}

/** A failed load is an inline panel with a retry, not a toast that takes itself away. */
export const Failed: Story = {
  args: {
    rows: [],
    errorMessage: 'Could not load events. Try again.',
    meta: { total: 0, page: 1, perPage: 10, totalPages: 1 },
  },
}

export const Selectable: Story = {
  args: { selectable: true, selectedIds: ['evt_001', 'evt_003'] },
}
