<script setup lang="ts">
import { useForm } from 'vee-validate'
import { computed, watch } from 'vue'

import { eventSchema, type EventFormValues } from '@/features/events/schema'
import { useEventsStore } from '@/features/events/store'
import { EVENT_STATUS_OPTIONS, type Event } from '@/features/events/types'
import { useAsyncAction, useNotifications } from '@/shared/composables'
import { zodSchema } from '@/shared/validation/zodSchema'
import { BaseButton, BaseDatePicker, BaseInput, BaseModal, BaseSelect } from '@/shared/ui'

/** Create and edit an event. One dialog, driven by an optional `event` prop. */

interface Props {
  event?: Event | null | undefined
}

const props = withDefaults(defineProps<Props>(), { event: null })

const emit = defineEmits<{ saved: [event: Event] }>()

const open = defineModel<boolean>('open', { required: true })

const store = useEventsStore()
const notifications = useNotifications()

const isEdit = computed(() => props.event !== null)

/** A sensible default for a new event: tomorrow, 19:00 UTC, running two hours. */
function defaultRange(): { startDate: string; endDate: string } {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + 1)
  start.setUTCHours(19, 0, 0, 0)
  const end = new Date(start)
  end.setUTCHours(21, 0, 0, 0)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

const { defineField, handleSubmit, errors, setErrors, resetForm } = useForm({
  validationSchema: zodSchema(eventSchema),
  initialValues: { name: '', country: '', venue: '', status: 'draft', ...defaultRange() },
})

const [name] = defineField('name')
const [country] = defineField('country')
const [venue] = defineField('venue')
const [startDate] = defineField('startDate')
const [endDate] = defineField('endDate')
const [status] = defineField('status')

const countryOptions = computed(() => store.countries.map((value) => ({ value, label: value })))

const save = useAsyncAction(
  (values: EventFormValues) =>
    props.event ? store.update(props.event.id, values) : store.create(values),
  {
    onSuccess: (saved) => {
      notifications.success(
        isEdit.value ? 'Event updated' : 'Event created',
        `“${saved.name}” has been saved.`,
      )
      open.value = false
      emit('saved', saved)
    },
    onError: (error) => {
      if (error.isValidation) setErrors(error.fieldErrors)
    },
  },
)

const formError = computed(() => {
  const error = save.error.value
  if (!error || error.isValidation) return null
  return error.message
})

const submitting = computed(() => save.pending.value)

watch(
  () => [open.value, props.event] as const,
  ([isOpen, event]) => {
    if (!isOpen) return
    save.reset()
    const range = defaultRange()
    resetForm({
      values: {
        name: event?.name ?? '',
        country: event?.country ?? '',
        venue: event?.venue ?? '',
        startDate: event?.startDate ?? range.startDate,
        endDate: event?.endDate ?? range.endDate,
        status: event?.status ?? 'draft',
      },
    })
  },
  { immediate: true },
)

const onSubmit = handleSubmit((values) => save.run(values))
</script>

<template>
  <BaseModal
    v-model:open="open"
    :title="isEdit ? 'Edit event' : 'New event'"
    :busy="submitting"
    width="38rem"
  >
    <form id="event-form" class="flex flex-col gap-4" novalidate @submit="onSubmit">
      <p
        v-if="formError"
        role="alert"
        class="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        {{ formError }}
      </p>

      <BaseInput
        v-model="name"
        label="Name"
        placeholder="e.g. Summer Music Festival"
        required
        :error="errors.name"
        :disabled="submitting"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseSelect
          v-model="country"
          label="Country"
          :options="countryOptions"
          placeholder="Select a country"
          filterable
          required
          :error="errors.country"
          :disabled="submitting"
        />
        <BaseInput
          v-model="venue"
          label="Venue"
          placeholder="e.g. Accor Arena"
          required
          :error="errors.venue"
          :disabled="submitting"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseDatePicker
          v-model="startDate"
          label="Starts"
          required
          :error="errors.startDate"
          :disabled="submitting"
        />
        <!-- `min` stops the invalid range being chosen; the schema still rejects it if it is. -->
        <BaseDatePicker
          v-model="endDate"
          label="Ends"
          required
          :min="startDate"
          :error="errors.endDate"
          :disabled="submitting"
        />
      </div>

      <BaseSelect
        v-model="status"
        label="Status"
        :options="EVENT_STATUS_OPTIONS"
        required
        :error="errors.status"
        :disabled="submitting"
      />
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" :disabled="submitting" @click="open = false">
          Cancel
        </BaseButton>
        <BaseButton type="submit" form="event-form" :loading="submitting">
          {{ isEdit ? 'Save changes' : 'Create event' }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
