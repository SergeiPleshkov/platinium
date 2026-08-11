import type { StoryObj } from '@storybook/vue3-vite'

import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'

const meta = {
  title: 'Primitives/BaseButton',
  component: BaseButton,
  tags: ['autodocs'],
  args: { label: 'Create event' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    iconPosition: { control: 'inline-radio', options: ['left', 'right'] },
  },
}

export default meta
type Story = StoryObj<typeof BaseButton>

export const Primary: Story = {}

export const Variants: Story = {
  render: (args) => ({
    components: { BaseButton },
    setup: () => ({ args }),
    template: `
      <div class="flex flex-wrap items-center gap-3">
        <BaseButton v-bind="args" variant="primary" label="Primary" />
        <BaseButton v-bind="args" variant="secondary" label="Secondary" />
        <BaseButton v-bind="args" variant="ghost" label="Ghost" />
        <BaseButton v-bind="args" variant="danger" label="Delete" />
      </div>
    `,
  }),
}

export const Sizes: Story = {
  render: (args) => ({
    components: { BaseButton },
    setup: () => ({ args }),
    template: `
      <div class="flex flex-wrap items-center gap-3">
        <BaseButton v-bind="args" size="sm" label="Small" />
        <BaseButton v-bind="args" size="md" label="Medium" />
        <BaseButton v-bind="args" size="lg" label="Large" />
      </div>
    `,
  }),
}

export const WithIcon: Story = {
  args: { icon: 'pi pi-plus' },
}

/**
 * Icon-only buttons keep their accessible name in `aria-label`, because an icon is not a name.
 * PrimeVue decides icon-only styling from `hasIcon && !label` and never inspects slot content,
 * so passing both an icon and slot text used to render a squashed button with the label
 * clipped. `BaseButton` makes that decision from our own props instead.
 */
export const IconOnly: Story = {
  render: () => ({
    components: { BaseButton },
    template: `<BaseButton icon="pi pi-trash" variant="ghost" aria-label="Delete ticket" />`,
  }),
}

/**
 * `loading` is preferred over setting `disabled` by hand: it blocks interaction *and* says why,
 * so a slow save reads as busy rather than broken.
 */
export const Loading: Story = {
  args: { loading: true },
}

export const Disabled: Story = {
  args: { disabled: true },
}

/** Stretches to the container, for dialog footers and mobile layouts. */
export const Block: Story = {
  args: { block: true },
  decorators: [() => ({ template: '<div class="max-w-sm"><story /></div>' })],
}
