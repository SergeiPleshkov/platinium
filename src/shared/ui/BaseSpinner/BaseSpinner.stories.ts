import type { StoryObj } from '@storybook/vue3-vite'

import BaseSpinner from '@/shared/ui/BaseSpinner/BaseSpinner.vue'

const meta = {
  title: 'Feedback/BaseSpinner',
  component: BaseSpinner,
  tags: ['autodocs'],
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
}

export default meta
type Story = StoryObj<typeof BaseSpinner>

export const Default: Story = {}

export const Sizes: Story = {
  render: () => ({
    components: { BaseSpinner },
    template: `
      <div class="flex items-center gap-6">
        <BaseSpinner size="sm" label="Loading, small" />
        <BaseSpinner size="md" label="Loading, medium" />
        <BaseSpinner size="lg" label="Loading, large" />
      </div>
    `,
  }),
}

/**
 * By default the spinner is a live region: it announces "Loading" to a screen reader,
 * because a page that says nothing reads as frozen rather than busy.
 *
 * `decorative` drops the live region and leaves the shape. Use it whenever the spinner sits
 * inside a container that is already announcing, since two nested live regions read the same
 * wait out twice. That is invisible in a screenshot and obvious with a screen reader on.
 */
export const Decorative: Story = {
  args: { decorative: true },
}
