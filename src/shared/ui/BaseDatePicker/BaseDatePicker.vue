<script setup lang="ts">
import DatePicker from 'primevue/datepicker'
import { computed } from 'vue'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'

/**
 * A labelled date-and-time picker that speaks ISO-8601 strings.
 *
 * The conversion to and from `Date` happens here and nowhere else. Domain state stays
 * string-typed end to end, see `BaseEntity`, because a `Date` in a store breaks structural
 * equality, serialises inconsistently, and drags local-timezone assumptions into data that
 * came from the server in UTC.
 */

interface Props {
  label: string
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  showTime?: boolean | undefined
  /** Earliest selectable value, as ISO-8601, used to keep an end date after its start. */
  min?: string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  required: false,
  disabled: false,
  showTime: true,
})

const model = defineModel<string | undefined>()

const asDate = computed<Date | null>({
  get() {
    if (!model.value) return null
    const parsed = new Date(model.value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  },
  set(value) {
    model.value = value ? value.toISOString() : ''
  },
})

const minDate = computed<Date | undefined>(() => {
  if (!props.min) return undefined
  const parsed = new Date(props.min)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
})
</script>

<template>
  <BaseFormField :label="label" :hint="hint" :error="error" :required="required">
    <template #default="{ inputId, describedBy, invalid }">
      <DatePicker
        v-model="asDate"
        :input-id="inputId"
        :show-time="showTime"
        hour-format="24"
        date-format="yy-mm-dd"
        :min-date="minDate"
        :disabled="disabled"
        :invalid="invalid"
        :aria-describedby="describedBy"
        show-icon
        icon-display="input"
        fluid
      />
    </template>
  </BaseFormField>
</template>
