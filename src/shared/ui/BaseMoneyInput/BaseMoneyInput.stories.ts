import type { StoryObj } from '@storybook/vue3-vite'

import BaseMoneyInput from '@/shared/ui/BaseMoneyInput/BaseMoneyInput.vue'

/**
 * Prices are held as integer minor units and never as floats. The model value here is
 * `4500`, not `45.00`, because `Math.round(1.005 * 100)` is 100 rather than 101 and a
 * rounding bug in a price field is the kind that reaches an invoice.
 */
const meta = {
  title: 'Form/BaseMoneyInput',
  component: BaseMoneyInput,
  tags: ['autodocs'],
  args: { label: 'Price', currency: 'EUR', modelValue: 4500 },
  argTypes: { currency: { control: 'inline-radio', options: ['EUR', 'GBP', 'USD'] } },
}

export default meta
type Story = StoryObj<typeof BaseMoneyInput>

export const Default: Story = {}

export const Currencies: Story = {
  render: () => ({
    components: { BaseMoneyInput },
    setup: () => ({ amount: 4500 }),
    template: `
      <div class="grid gap-4 sm:grid-cols-3">
        <BaseMoneyInput label="Euro" currency="EUR" :model-value="amount" />
        <BaseMoneyInput label="Sterling" currency="GBP" :model-value="amount" />
        <BaseMoneyInput label="Dollar" currency="USD" :model-value="amount" />
      </div>
    `,
  }),
}

/** Zero is a valid price. A free ticket is a real thing, not a validation failure. */
export const Free: Story = {
  args: { modelValue: 0 },
}

export const WithError: Story = {
  args: { error: 'Price looks too high. Check the decimal point.', modelValue: 999_999_999 },
}

export const Disabled: Story = {
  args: { disabled: true },
}
