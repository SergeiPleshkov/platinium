import type { StoryObj } from '@storybook/vue3-vite'

import BaseDatePicker from '@/shared/ui/BaseDatePicker/BaseDatePicker.vue'

/**
 * Dates cross the boundary as ISO-8601 strings and are parsed only inside formatting
 * helpers, so no `Date` object leaks into a store.
 */
const meta = {
  title: 'Form/BaseDatePicker',
  component: BaseDatePicker,
  tags: ['autodocs'],
  args: { label: 'Starts', modelValue: '2026-07-01T18:00:00.000Z' },
}

export default meta
type Story = StoryObj<typeof BaseDatePicker>

export const Default: Story = {}

export const WithTime: Story = {
  args: { showTime: true },
}

/** `min` is how the end date refuses to fall before the start. */
export const WithMinimum: Story = {
  args: { label: 'Ends', min: '2026-07-01T18:00:00.000Z', modelValue: undefined },
}

export const WithError: Story = {
  args: { label: 'Ends', error: 'The end date must be after the start date' },
}

export const Disabled: Story = {
  args: { disabled: true },
}
