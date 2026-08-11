import { ref } from 'vue'
import type { StoryObj } from '@storybook/vue3-vite'

import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseModal from '@/shared/ui/BaseModal/BaseModal.vue'

/**
 * Focus is trapped while open, `Esc` closes, and focus returns to whatever opened it.
 * PrimeVue provides most of that; the tests assert it rather than assuming it.
 */
const meta = {
  title: 'Overlay/BaseModal',
  component: BaseModal,
  tags: ['autodocs'],
  args: { title: 'Edit event' },
}

export default meta
type Story = StoryObj<typeof BaseModal>

export const Default: Story = {
  render: (args) => ({
    components: { BaseModal, BaseButton },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <BaseButton label="Open the dialog" @click="open = true" />
        <BaseModal v-bind="args" v-model:open="open">
          <p class="text-content">Body content goes in the default slot.</p>
          <template #footer>
            <BaseButton variant="secondary" label="Cancel" @click="open = false" />
            <BaseButton label="Save" @click="open = false" />
          </template>
        </BaseModal>
      </div>
    `,
  }),
}

export const WithDescription: Story = {
  ...Default,
  args: { title: 'Edit event', description: 'Changes apply as soon as you save.' },
}

/** `busy` blocks the close affordances while a request is in flight. */
export const Busy: Story = {
  ...Default,
  args: { title: 'Saving', busy: true },
}
