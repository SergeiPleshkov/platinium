<script setup lang="ts" generic="TValue extends string">
import { computed } from 'vue'

/**
 * A small exclusive choice between two or three options, rendered inline.
 *
 * Written by hand rather than wrapped around PrimeVue's `SelectButton`, and the reason is the
 * accessibility contract: this is a radio group, and it needs real roving-tabindex arrow-key
 * behaviour. `SelectButton` renders buttons with `aria-pressed`, which announces as "toggle
 * button, pressed", three independent toggles rather than one choice of three. Forty lines
 * of correct semantics beat a wrapper that has to fight its wrapped component.
 *
 * That the UI kit is *allowed* to contain hand-written primitives is the point of the kit
 * being ours.
 */

export interface SegmentedOption<TValue extends string> {
  value: TValue
  label: string
  icon?: string | undefined
}

const props = defineProps<{
  modelValue: TValue
  options: ReadonlyArray<SegmentedOption<TValue>>
  /** Names the group for assistive technology. Required, an unlabelled radio group is a puzzle. */
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: TValue] }>()

const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue),
)

function select(value: TValue): void {
  if (value !== props.modelValue) emit('update:modelValue', value)
}

/**
 * Arrow keys move the selection, which is what a radio group does, Tab enters and leaves the
 * group as a single stop rather than visiting every option.
 */
function onKeydown(event: KeyboardEvent): void {
  const delta =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0
  if (delta === 0) return

  event.preventDefault()
  const count = props.options.length
  const next = props.options[(selectedIndex.value + delta + count) % count]
  if (next) select(next.value)
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="inline-flex rounded-md border border-border bg-surface-100 p-0.5 dark:bg-surface-800"
  >
    <!--
      The arrow-key handler sits on the radios, not on the group. Bubbling to the group would
      work identically, but a keyboard handler on a container with an interactive role implies
      the container itself is focusable, which it must not be, because in a roving-tabindex
      radio group focus belongs to the checked option.
    -->
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      :class="[
        'flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
        option.value === modelValue
          ? 'bg-surface-0 text-content shadow-sm dark:bg-surface-950'
          : 'text-content-muted hover:text-content',
      ]"
      @keydown="onKeydown"
      @click="select(option.value)"
    >
      <i v-if="option.icon" :class="[option.icon, 'text-xs']" aria-hidden="true" />
      {{ option.label }}
    </button>
  </div>
</template>
