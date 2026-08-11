import { ref } from 'vue'
import type { StoryObj } from '@storybook/vue3-vite'

import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseConfirmDialog from '@/shared/ui/BaseConfirmDialog/BaseConfirmDialog.vue'

/**
 * Every destructive action goes through this first.
 *
 * `errorMessage` renders in place rather than as a toast, because the reason a delete was
 * refused ("still has 25 tickets") belongs where the user took the action, not in a corner
 * that disappears after four seconds.
 */
type Story = StoryObj<typeof BaseConfirmDialog>

/** A trigger button, because a dialog with no way to open it documents nothing. */
const renderWithTrigger: Story['render'] = (args) => ({
  components: { BaseConfirmDialog, BaseButton },
  setup() {
    const open = ref(false)
    return { args, open }
  },
  template: `
    <div>
      <BaseButton variant="danger" label="Delete event" @click="open = true" />
      <BaseConfirmDialog v-bind="args" v-model:open="open" @cancel="open = false" />
    </div>
  `,
})

const meta = {
  title: 'Overlay/BaseConfirmDialog',
  component: BaseConfirmDialog,
  tags: ['autodocs'],
  args: {
    title: 'Delete this event?',
    message: 'Summer Music Festival will be removed. This cannot be undone.',
  },
  render: renderWithTrigger,
}

export default meta

export const Default: Story = {}

export const CustomLabels: Story = {
  args: { confirmLabel: 'Cancel the event', cancelLabel: 'Keep it' },
}

export const Busy: Story = {
  args: { busy: true },
}

/** A 409 from the server, explained where the action was taken. */
export const RefusedByTheServer: Story = {
  args: {
    errorMessage: '“Summer Music Festival” still has 25 tickets. Delete those first.',
  },
}
