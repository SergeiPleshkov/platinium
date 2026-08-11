import type { StoryObj } from '@storybook/vue3-vite'

import BaseTextarea from '@/shared/ui/BaseTextarea/BaseTextarea.vue'

const meta = {
  title: 'Form/BaseTextarea',
  component: BaseTextarea,
  tags: ['autodocs'],
  args: { label: 'Description', modelValue: '' },
}

export default meta
type Story = StoryObj<typeof BaseTextarea>

export const Default: Story = {}

export const WithHint: Story = {
  args: { hint: 'Optional. Explains what this category covers.' },
}

export const WithError: Story = {
  args: { error: 'Keep the description under 500 characters' },
}

export const Disabled: Story = {
  args: { disabled: true, modelValue: 'Front rows, closest to the stage.' },
}
