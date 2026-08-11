import type { StoryObj } from '@storybook/vue3-vite'

import BaseSkeleton from '@/shared/ui/BaseSkeleton/BaseSkeleton.vue'

/**
 * Shown before the first load, never as a spinner over an empty grid. A placeholder that
 * occupies the space the real row will occupy means nothing jumps when the data lands.
 */
const meta = {
  title: 'Feedback/BaseSkeleton',
  component: BaseSkeleton,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof BaseSkeleton>

export const Default: Story = {}

export const Sizes: Story = {
  render: () => ({
    components: { BaseSkeleton },
    template: `
      <div class="space-y-3">
        <BaseSkeleton width="12rem" height="1.5rem" />
        <BaseSkeleton width="100%" />
        <BaseSkeleton width="60%" />
      </div>
    `,
  }),
}

/** `rounded` for avatars and icon placeholders. */
export const Rounded: Story = {
  args: { width: '3rem', height: '3rem', rounded: true },
}

export const AsATableRow: Story = {
  render: () => ({
    components: { BaseSkeleton },
    template: `
      <div class="space-y-3">
        <div v-for="row in 4" :key="row" class="flex items-center gap-4">
          <BaseSkeleton width="14rem" />
          <BaseSkeleton width="6rem" />
          <BaseSkeleton width="4rem" />
        </div>
      </div>
    `,
  }),
}
