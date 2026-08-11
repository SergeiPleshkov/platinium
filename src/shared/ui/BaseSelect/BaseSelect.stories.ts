import type { StoryObj } from '@storybook/vue3-vite'

import BaseSelect from '@/shared/ui/BaseSelect/BaseSelect.vue'

const COUNTRIES = [
  { value: 'fr', label: 'France' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'de', label: 'Germany' },
  { value: 'es', label: 'Spain' },
]

const meta = {
  title: 'Form/BaseSelect',
  component: BaseSelect,
  tags: ['autodocs'],
  args: { label: 'Country', options: COUNTRIES, placeholder: 'Choose a country' },
}

export default meta
type Story = StoryObj<typeof BaseSelect>

export const Default: Story = {}

export const WithSelection: Story = {
  args: { modelValue: 'nl' },
}

export const Clearable: Story = {
  args: { modelValue: 'fr', clearable: true },
}

export const Multiple: Story = {
  args: { label: 'Statuses', multiple: true, modelValue: ['fr', 'de'] },
}

/**
 * `filterable` narrows the list as the user types. The relation pickers pass `onFilter` as
 * well, which sends the term to the server instead of filtering what was already loaded, so
 * an option outside the first page is still reachable.
 */
export const Filterable: Story = {
  args: { filterable: true },
}

export const WithError: Story = {
  args: { error: 'Choose a country' },
}

export const Disabled: Story = {
  args: { disabled: true, modelValue: 'es' },
}
