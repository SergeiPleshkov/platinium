<script setup lang="ts">
import InputText from 'primevue/inputtext'
import { ref, watch } from 'vue'

import BaseFormField from '@/shared/ui/BaseFormField/BaseFormField.vue'
import { parseMoney, toMajorUnits, type CurrencyCode } from '@/shared/utils/money'

/**
 * A money field.
 *
 * The model is an integer count of minor units, the only representation the rest of the
 * application uses. This component is the single place that converts to and from the major
 * amount a person types, which is what keeps floats out of the domain entirely.
 *
 * Text state is kept separately from the model while editing, so a half-typed "12." is not
 * round-tripped into "12" under the cursor.
 */

interface Props {
  label: string
  currency: CurrencyCode
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
}

const props = withDefaults(defineProps<Props>(), { required: false, disabled: false })

/** Minor units. `undefined` means the field is empty or not yet a valid amount. */
const model = defineModel<number | undefined>()

const text = ref(model.value === undefined ? '' : String(toMajorUnits(model.value, props.currency)))

/*
 * Re-sync only when the model changes to something the current text does not already mean
 * otherwise typing "1", "12", "12." would fight the formatter on every keystroke.
 */
watch(
  () => model.value,
  (next) => {
    /*
     * `?? undefined` matters: `parseMoney` returns `null` for unparseable input while the
     * model uses `undefined`, and `null !== undefined`. Without the normalisation, typing
     * "42.50" wiped the field at the intermediate "42.", where parsing legitimately fails
     * and silently re-collected the remaining keystrokes as "50", storing 5000.
     */
    const current = parseMoney(text.value, props.currency) ?? undefined
    if (next === current) return
    text.value = next === undefined ? '' : String(toMajorUnits(next, props.currency))
  },
)

/** Re-express the amount if the currency changes under a typed value. */
watch(
  () => props.currency,
  (currency) => {
    if (model.value !== undefined) text.value = String(toMajorUnits(model.value, currency))
  },
)

function onInput(value: string): void {
  text.value = value
  const parsed = parseMoney(value, props.currency)
  // `undefined` rather than 0: an unparseable amount is absent, not free.
  model.value = parsed ?? undefined
}
</script>

<template>
  <BaseFormField :label="label" :hint="hint" :error="error" :required="required">
    <template #default="{ inputId, describedBy, invalid }">
      <div class="relative">
        <InputText
          :id="inputId"
          :model-value="text"
          type="text"
          inputmode="decimal"
          :placeholder="`0.00`"
          :disabled="disabled"
          :invalid="invalid"
          :aria-describedby="describedBy"
          class="pr-14"
          fluid
          @update:model-value="onInput(String($event ?? ''))"
        />
        <span
          class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-content-muted"
          aria-hidden="true"
        >
          {{ currency }}
        </span>
      </div>
    </template>
  </BaseFormField>
</template>
