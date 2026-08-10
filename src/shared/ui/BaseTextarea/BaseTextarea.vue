<script setup lang="ts">
import Textarea from 'primevue/textarea'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'

/** A labelled multi-line input. Same accessibility contract as `BaseInput`. */

interface Props {
  label: string
  placeholder?: string | undefined
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  rows?: number | undefined
}

withDefaults(defineProps<Props>(), { required: false, disabled: false, rows: 4 })

const model = defineModel<string | undefined>({ default: '' })
</script>

<template>
  <BaseFormField :label="label" :hint="hint" :error="error" :required="required">
    <template #default="{ inputId, describedBy, invalid }">
      <Textarea
        :id="inputId"
        v-model="model"
        :rows="rows"
        :placeholder="placeholder"
        :disabled="disabled"
        :invalid="invalid"
        :aria-describedby="describedBy"
        auto-resize
        fluid
      />
    </template>
  </BaseFormField>
</template>
