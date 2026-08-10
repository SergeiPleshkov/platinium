<script setup lang="ts">
import PrimeButton from 'primevue/button'
import { computed } from 'vue'

import type { ButtonSize, ButtonVariant } from '@/shared/ui/BaseButton/types'

/**
 * The application's button.
 *
 * PrimeVue is an implementation detail here: callers describe intent (`variant`, `size`,
 * `loading`) and this component translates it. Nothing outside `shared/ui` knows PrimeVue
 * exists, which is what keeps the UI kit swappable.
 */

interface Props {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  /** Shows a spinner and blocks interaction. Prefer this over disabling manually. */
  loading?: boolean | undefined
  disabled?: boolean | undefined
  /** A PrimeIcons class, e.g. `pi pi-plus`. */
  icon?: string | undefined
  iconPosition?: 'left' | 'right' | undefined
  /** Stretch to the width of the container — useful for mobile and dialog footers. */
  block?: boolean | undefined
  /**
   * Visible text, as an alternative to the default slot.
   *
   * Prefer this whenever the button also has an `icon`: PrimeVue decides its icon-only
   * styling from `hasIcon && !label` and does *not* look at slot content, so `icon` plus a
   * slot renders as a 40px icon button with the text clipped. An icon-only button should
   * instead pass `aria-label`, which falls through to the element.
   */
  label?: string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  iconPosition: 'left',
  block: false,
})

defineEmits<{ click: [event: MouseEvent] }>()

defineSlots<{ default?: () => unknown }>()

/** Intent → PrimeVue appearance. A lookup, never a chain of ternaries in the template. */
const VARIANT_STYLES = {
  primary: { severity: undefined, outlined: false, text: false },
  secondary: { severity: 'secondary', outlined: true, text: false },
  danger: { severity: 'danger', outlined: false, text: false },
  ghost: { severity: 'secondary', outlined: false, text: true },
} as const satisfies Record<
  ButtonVariant,
  { severity?: string | undefined; outlined: boolean; text: boolean }
>

const SIZE_STYLES = {
  sm: 'small',
  md: undefined,
  lg: 'large',
} as const satisfies Record<ButtonSize, 'small' | 'large' | undefined>

const appearance = computed(() => VARIANT_STYLES[props.variant])
const primeSize = computed(() => SIZE_STYLES[props.size])
const isInteractionBlocked = computed(() => props.disabled || props.loading)
</script>

<template>
  <!--
    A button never shrinks below its label and never wraps it. In a tight flex row — a page
    header on a narrow viewport — the default `flex-shrink: 1` squeezed "New category" down
    to 40px and clipped it mid-word.
  -->
  <PrimeButton
    class="shrink-0 whitespace-nowrap"
    :severity="appearance.severity"
    :outlined="appearance.outlined"
    :text="appearance.text"
    :size="primeSize"
    :loading="loading"
    :disabled="isInteractionBlocked"
    :icon="icon"
    :icon-pos="iconPosition"
    :label="label"
    :fluid="block"
    :aria-busy="loading"
    @click="$emit('click', $event)"
  >
    <slot />
  </PrimeButton>
</template>
