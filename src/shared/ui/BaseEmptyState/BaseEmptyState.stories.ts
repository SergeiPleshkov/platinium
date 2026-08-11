import type { StoryObj } from '@storybook/vue3-vite'

import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseEmptyState from '@/shared/ui/BaseEmptyState/BaseEmptyState.vue'

/**
 * One of the four states every list has to handle: loading, empty, error, loaded. The action
 * slot exists because an empty list with no way forward is a dead end.
 */
const meta = {
  title: 'Feedback/BaseEmptyState',
  component: BaseEmptyState,
  tags: ['autodocs'],
  args: { title: 'No events yet' },
}

export default meta
type Story = StoryObj<typeof BaseEmptyState>

export const Default: Story = {}

export const WithDescription: Story = {
  args: { description: 'Create an event and it will show up here.' },
}

export const WithAction: Story = {
  render: (args) => ({
    components: { BaseEmptyState, BaseButton },
    setup: () => ({ args }),
    template: `
      <BaseEmptyState v-bind="args">
        <template #action>
          <BaseButton icon="pi pi-plus" label="New event" />
        </template>
      </BaseEmptyState>
    `,
  }),
  args: { description: 'Create an event and it will show up here.' },
}

/**
 * A filtered list that matches nothing is a different state from an empty one, and it needs
 * a different way out: clear the filters rather than create a record.
 */
export const NoResultsForFilters: Story = {
  render: () => ({
    components: { BaseEmptyState, BaseButton },
    template: `
      <BaseEmptyState
        icon="pi pi-filter-slash"
        title="No events match these filters"
        description="Try a different search term, or clear the filters to see everything."
      >
        <template #action>
          <BaseButton variant="secondary" label="Clear filters" />
        </template>
      </BaseEmptyState>
    `,
  }),
}
