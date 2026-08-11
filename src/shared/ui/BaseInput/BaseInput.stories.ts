import type { StoryObj } from '@storybook/vue3-vite'

import BaseInput from '@/shared/ui/BaseInput/BaseInput.vue'

const meta = {
  title: 'Form/BaseInput',
  component: BaseInput,
  tags: ['autodocs'],
  args: { label: 'Event name', modelValue: '' },
  argTypes: {
    type: { control: 'select', options: ['text', 'email', 'password', 'search', 'tel', 'url'] },
  },
}

export default meta
type Story = StoryObj<typeof BaseInput>

export const Default: Story = {}

export const WithHint: Story = {
  args: { hint: 'Shown to buyers on the ticket page.' },
}

/**
 * An error replaces the hint rather than stacking under it, and wires up `aria-invalid`
 * plus `aria-describedby`. The message is the same one the zod schema produces, so the
 * server and the form never disagree about the wording.
 */
export const WithError: Story = {
  args: { error: 'Enter an event name', modelValue: '' },
}

export const Required: Story = {
  args: { required: true },
}

export const Disabled: Story = {
  args: { disabled: true, modelValue: 'Summer Music Festival' },
}

/**
 * The label is hidden visually and kept for assistive technology, for the case where
 * surrounding context already names the field. It is never removed.
 */
export const HiddenLabel: Story = {
  args: { labelHidden: true, placeholder: 'Search events' },
}
