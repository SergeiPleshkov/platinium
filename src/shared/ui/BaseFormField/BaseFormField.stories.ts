import type { StoryObj } from '@storybook/vue3-vite'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'

/**
 * The label, hint and error wrapper every input in the kit is built on.
 *
 * It hands the control its ids through a scoped slot rather than expecting each input to
 * assemble them, which is how one field ends up unlabelled while the rest are fine.
 */
type Story = StoryObj<typeof BaseFormField>

/** Every story renders a plain input through the scoped slot, so the wiring is the subject. */
const renderWithControl: Story['render'] = (args) => ({
  components: { BaseFormField },
  setup: () => ({ args }),
  template: `
    <BaseFormField v-bind="args">
      <template #default="{ inputId, describedBy, invalid }">
        <input
          :id="inputId"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          class="w-full rounded-md border border-border bg-surface-0 px-3 py-2 dark:bg-surface-900"
        />
      </template>
    </BaseFormField>
  `,
})

const meta = {
  title: 'Form/BaseFormField',
  component: BaseFormField,
  tags: ['autodocs'],
  args: { label: 'Venue' },
  render: renderWithControl,
}

export default meta

export const Default: Story = {}

export const WithHint: Story = {
  args: { hint: 'The building, not the city.' },
}

/** The error takes the hint's place instead of stacking, and the control becomes invalid. */
export const WithError: Story = {
  args: { hint: 'The building, not the city.', error: 'Enter a venue' },
}

export const Required: Story = {
  args: { required: true },
}

/**
 * `labellable: false` for composite widgets. PrimeVue's `Select` and `DatePicker` render a
 * `<div>` root, and `<label for>` pointing at a div associates with nothing, so the field
 * switches to `aria-labelledby` instead.
 */
export const CompositeControl: Story = {
  args: { labellable: false, label: 'Category' },
}
