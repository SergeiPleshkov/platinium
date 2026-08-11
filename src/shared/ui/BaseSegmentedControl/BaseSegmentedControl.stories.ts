import { ref } from 'vue'
import type { StoryObj } from '@storybook/vue3-vite'

import BaseSegmentedControl from '@/shared/ui/BaseSegmentedControl/BaseSegmentedControl.vue'

/**
 * A real radio group, written by hand.
 *
 * PrimeVue's `SelectButton` renders buttons carrying `aria-pressed`, which a screen reader
 * announces as three independent toggles rather than one choice of three. This implements
 * roving tabindex instead: Tab enters and leaves the group as a single stop, and the arrow
 * keys move the selection. Try it with the keyboard rather than the mouse.
 */
const meta = {
  title: 'Primitives/BaseSegmentedControl',
  component: BaseSegmentedControl,
  tags: ['autodocs'],
  args: {
    label: 'Colour scheme',
    modelValue: 'system',
    options: [
      { value: 'light', label: 'Light', icon: 'pi pi-sun' },
      { value: 'system', label: 'System', icon: 'pi pi-desktop' },
      { value: 'dark', label: 'Dark', icon: 'pi pi-moon' },
    ],
  },
}

export default meta
type Story = StoryObj<typeof BaseSegmentedControl>

/** Interactive: the selection follows the arrow keys as well as the pointer. */
export const Default: Story = {
  render: (args) => ({
    components: { BaseSegmentedControl },
    setup() {
      const value = ref(args.modelValue)
      return { args, value }
    },
    template: `<BaseSegmentedControl v-bind="args" v-model="value" />`,
  }),
}

export const TwoOptions: Story = {
  args: {
    label: 'Table rendering',
    modelValue: 'paginated',
    options: [
      { value: 'paginated', label: 'Pages' },
      { value: 'virtual', label: 'Scroll' },
    ],
  },
}

export const WithoutIcons: Story = {
  args: {
    options: [
      { value: 'light', label: 'Light' },
      { value: 'system', label: 'System' },
      { value: 'dark', label: 'Dark' },
    ],
  },
}
