import type { StoryObj } from '@storybook/vue3-vite'

import BaseBulkBar from '@/shared/ui/BaseBulkBar/BaseBulkBar.vue'

/**
 * Appears once rows are ticked. It is a live region, because it shows up in response to a
 * checkbox that may be several rows away from where it renders.
 *
 * The action buttons are gated on capabilities, not roles, so an editor sees the status
 * change and not the delete.
 */
const meta = {
  title: 'Bulk/BaseBulkBar',
  component: BaseBulkBar,
  tags: ['autodocs'],
  args: {
    count: 3,
    entityLabel: 'event',
    canUpdate: true,
    canDelete: true,
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'published', label: 'Published' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
}

export default meta
type Story = StoryObj<typeof BaseBulkBar>

export const Default: Story = {}

export const SingleRow: Story = {
  args: { count: 1 },
}

/** An editor may change a status but not delete, so the delete button is absent, not disabled. */
export const EditorPermissions: Story = {
  args: { canDelete: false },
}

export const Busy: Story = {
  args: { busy: true },
}
