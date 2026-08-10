<script setup lang="ts">
import InputText from 'primevue/inputtext'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'

/**
 * A labelled text input.
 *
 * Bundles the control with its label, hint and error rather than leaving callers to assemble
 * them, so a field cannot ship unlabelled or with an error that assistive tech never
 * announces.
 */

interface Props {
  label: string
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | undefined
  placeholder?: string | undefined
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  labelHidden?: boolean | undefined
  autocomplete?: string | undefined
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  required: false,
  disabled: false,
  labelHidden: false,
})

/*
 * Accepts `undefined` because vee-validate's `defineField` hands back a
 * `Ref<string | undefined>` for an untouched field; the default keeps the control itself
 * always controlled.
 */
const model = defineModel<string | undefined>({ default: '' })
</script>

<template>
  <BaseFormField
    :label="label"
    :hint="hint"
    :error="error"
    :required="required"
    :label-hidden="labelHidden"
  >
    <template #default="{ inputId, describedBy, invalid }">
      <InputText
        :id="inputId"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :invalid="invalid"
        :required="required"
        :autocomplete="autocomplete"
        :aria-describedby="describedBy"
        fluid
      />
    </template>
  </BaseFormField>
</template>
