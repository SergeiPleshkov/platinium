import type { StoryObj } from '@storybook/vue3-vite'

import BaseSearchInput from '@/shared/ui/BaseSearchInput/BaseSearchInput.vue'

/**
 * The search box above every list. Debouncing lives in `useTable`, not here: this component
 * reports what was typed, and the composable decides when that becomes a request.
 */
const meta = {
  title: 'Form/BaseSearchInput',
  component: BaseSearchInput,
  tags: ['autodocs'],
  args: { modelValue: '' },
}

export default meta
type Story = StoryObj<typeof BaseSearchInput>

export const Default: Story = {}

export const WithValue: Story = {
  args: { modelValue: 'Summer Gala' },
}

export const Disabled: Story = {
  args: { disabled: true },
}
