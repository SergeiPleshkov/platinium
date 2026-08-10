<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Label, hint and error scaffolding for a single form control.
 *
 * The accessibility wiring — `for`/`id`, `aria-describedby`, `aria-invalid`, and announcing
 * the error to assistive tech — is written once here, and every control reuses it through the
 * scoped slot. Repeating it per control is how one field ends up with an unlabelled input
 * that nobody notices until an audit.
 */

interface Props {
  label: string
  /**
   * Supporting copy shown under the control, hidden once an error takes its place.
   *
   * Optional props are declared `| undefined` throughout the UI kit: with
   * `exactOptionalPropertyTypes`, a template binding like `:hint="maybeUndefined"` passes a
   * real `undefined` rather than omitting the prop, and the stricter type would reject it.
   */
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  /** Hides the label visually while keeping it for screen readers. */
  labelHidden?: boolean | undefined
}

const props = withDefaults(defineProps<Props>(), {
  required: false,
  labelHidden: false,
})

defineSlots<{
  default: (props: {
    inputId: string
    describedBy: string | undefined
    invalid: boolean
  }) => unknown
}>()

const uid = useId()
const inputId = computed(() => `field-${uid}`)
const hintId = computed(() => `${inputId.value}-hint`)
const errorId = computed(() => `${inputId.value}-error`)

const invalid = computed(() => Boolean(props.error))

/** Error wins over hint: pointing at both would read the stale hint after a failure. */
const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="inputId"
      :class="['text-sm font-medium text-content', labelHidden ? 'sr-only' : '']"
    >
      {{ label }}
      <span v-if="required" class="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">(required)</span>
    </label>

    <slot :input-id="inputId" :described-by="describedBy" :invalid="invalid" />

    <p v-if="!error && hint" :id="hintId" class="text-xs text-content-muted">
      {{ hint }}
    </p>

    <!--
      `role="alert"` so the message is announced when it appears. Without it a screen-reader
      user submits, hears nothing, and has no idea why the form did not advance.
    -->
    <p
      v-if="error"
      :id="errorId"
      role="alert"
      class="text-xs font-medium text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>
  </div>
</template>
