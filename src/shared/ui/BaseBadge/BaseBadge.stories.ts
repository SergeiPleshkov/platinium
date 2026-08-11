import type { StoryObj } from '@storybook/vue3-vite'

import BaseBadge from '@/shared/ui/BaseBadge/BaseBadge.vue'

const meta = {
  title: 'Primitives/BaseBadge',
  component: BaseBadge,
  tags: ['autodocs'],
  args: { label: 'Published', tone: 'success' },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'success', 'info', 'warning', 'danger'] },
  },
}

export default meta
type Story = StoryObj<typeof BaseBadge>

export const Default: Story = {}

/**
 * Every tone states its meaning in words. Colour is a second signal, never the only one, so
 * the badges stay readable to anyone who cannot distinguish them and in a greyscale print.
 */
export const Tones: Story = {
  render: () => ({
    components: { BaseBadge },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <BaseBadge label="Draft" tone="neutral" />
        <BaseBadge label="Published" tone="success" />
        <BaseBadge label="On sale" tone="info" />
        <BaseBadge label="Paused" tone="warning" />
        <BaseBadge label="Cancelled" tone="danger" />
      </div>
    `,
  }),
}
