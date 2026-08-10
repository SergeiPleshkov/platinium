<script setup lang="ts" generic="TValue extends string | number">
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'

/**
 * A labelled single- or multi-select.
 *
 * Both modes live here because they share every concern that matters — options shape, label
 * association, error handling — and differ only in cardinality. Two components would be two
 * places to forget `aria-describedby`.
 *
 * Note `input-id`, not `id`: PrimeVue's Select renders a `<div>` root, and a `<label for>`
 * pointing at a non-labellable element associates with nothing — the control ends up
 * unlabelled for assistive tech while looking correct on screen. `inputId` puts the id on the
 * inner focusable element, which is what the label needs.
 */

export interface SelectOption<T> {
  value: T
  label: string
}

interface Props {
  label: string
  options: ReadonlyArray<SelectOption<TValue>>
  placeholder?: string | undefined
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  labelHidden?: boolean | undefined
  /** Allows clearing back to no selection. Filters want this; required fields do not. */
  clearable?: boolean | undefined
  multiple?: boolean | undefined
  /** Adds a type-ahead box inside the overlay — worth it past roughly ten options. */
  filterable?: boolean | undefined
}

withDefaults(defineProps<Props>(), {
  required: false,
  disabled: false,
  labelHidden: false,
  clearable: false,
  multiple: false,
  filterable: false,
  placeholder: 'Select…',
})

const model = defineModel<TValue | TValue[] | null | undefined>()
</script>

<template>
  <BaseFormField
    :label="label"
    :hint="hint"
    :error="error"
    :required="required"
    :label-hidden="labelHidden"
    :labellable="false"
  >
    <template #default="{ inputId, labelId, describedBy, invalid }">
      <MultiSelect
        v-if="multiple"
        v-model="model"
        :input-id="inputId"
        :options="[...options]"
        option-label="label"
        option-value="value"
        :placeholder="placeholder"
        :disabled="disabled"
        :invalid="invalid"
        :aria-labelledby="labelId"
        :filter="filterable"
        :show-toggle-all="false"
        :aria-describedby="describedBy"
        display="chip"
        fluid
      />
      <Select
        v-else
        v-model="model"
        :input-id="inputId"
        :options="[...options]"
        option-label="label"
        option-value="value"
        :placeholder="placeholder"
        :disabled="disabled"
        :invalid="invalid"
        :aria-labelledby="labelId"
        :show-clear="clearable"
        :filter="filterable"
        :aria-describedby="describedBy"
        fluid
      />
    </template>
  </BaseFormField>
</template>
