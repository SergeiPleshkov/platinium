<script setup lang="ts">
import { useForm } from 'vee-validate'
import { computed, ref, watch } from 'vue'

import { useCategoriesStore } from '@/features/categories'
import { useEventsStore } from '@/features/events'
import { ticketSchema } from '@/features/tickets/schema'
import { useTicketsStore } from '@/features/tickets/store'
import { TICKET_STATUS_OPTIONS, type TicketWithRelations } from '@/features/tickets/types'
import { ApiError } from '@/shared/api'
import { useNotifications } from '@/shared/composables'
import { CURRENCIES, type CurrencyCode } from '@/shared/utils/money'
import { zodSchema } from '@/shared/validation/zodSchema'
import { BaseButton, BaseInput, BaseModal, BaseMoneyInput, BaseSelect } from '@/shared/ui'

/**
 * Create and edit a ticket.
 *
 * The relation pickers read from the events and categories stores through their public
 * barrels, the only sanctioned way one feature reaches another's data.
 */

interface Props {
  ticket?: TicketWithRelations | null | undefined
}

const props = withDefaults(defineProps<Props>(), { ticket: null })

const emit = defineEmits<{ saved: [ticket: TicketWithRelations] }>()

const open = defineModel<boolean>('open', { required: true })

const store = useTicketsStore()
const eventsStore = useEventsStore()
const categoriesStore = useCategoriesStore()
const notifications = useNotifications()

const submitting = ref(false)
const formError = ref<string | null>(null)

const isEdit = computed(() => props.ticket !== null)

const { defineField, handleSubmit, errors, setErrors, resetForm } = useForm({
  validationSchema: zodSchema(ticketSchema),
  initialValues: {
    name: '',
    priceMinor: 0,
    currency: 'EUR' as CurrencyCode,
    quantity: 0,
    status: 'draft' as const,
    eventId: '',
    categoryId: '',
  },
})

const [name] = defineField('name')
const [priceMinor] = defineField('priceMinor')
const [currency] = defineField('currency')
const [quantity] = defineField('quantity')
const [status] = defineField('status')
const [eventId] = defineField('eventId')
const [categoryId] = defineField('categoryId')

const eventOptions = computed(() =>
  eventsStore.options.map((option) => ({ value: option.id, label: option.name })),
)
const categoryOptions = computed(() =>
  categoriesStore.options.map((option) => ({ value: option.id, label: option.name })),
)
const currencyOptions = CURRENCIES.map((code) => ({ value: code, label: code }))

/**
 * Quantity is bound as text so an empty field stays distinguishable from a deliberate 0
 * zero is a real quantity here (sold out), so coercing blank input to it would be wrong.
 *
 * Unparseable input becomes `NaN`, which keeps the field's type honest and which zod rejects
 * with "Enter a quantity" rather than silently accepting a number nobody typed.
 */
const quantityText = computed({
  get: () => (Number.isFinite(quantity.value) ? String(quantity.value) : ''),
  set: (value: string | undefined) => {
    const trimmed = (value ?? '').trim()
    quantity.value = trimmed === '' ? Number.NaN : Number(trimmed)
  },
})

watch(
  () => [open.value, props.ticket] as const,
  ([isOpen, ticket]) => {
    if (!isOpen) return
    formError.value = null

    // Options are only needed once the dialog is actually opened.
    void eventsStore.fetchOptions()
    void categoriesStore.fetchOptions()

    resetForm({
      values: {
        name: ticket?.name ?? '',
        priceMinor: ticket?.priceMinor ?? 0,
        currency: ticket?.currency ?? 'EUR',
        quantity: ticket?.quantity ?? 0,
        status: ticket?.status ?? 'draft',
        eventId: ticket?.eventId ?? '',
        categoryId: ticket?.categoryId ?? '',
      },
    })
  },
  { immediate: true },
)

const onSubmit = handleSubmit(async (values) => {
  submitting.value = true
  formError.value = null

  try {
    const saved = props.ticket
      ? await store.update(props.ticket.id, values)
      : await store.create(values)

    notifications.success(
      isEdit.value ? 'Ticket updated' : 'Ticket created',
      `“${saved.name}” has been saved.`,
    )
    open.value = false
    emit('saved', saved)
  } catch (caught) {
    if (caught instanceof ApiError && caught.isValidation) {
      setErrors(caught.fieldErrors)
    } else {
      formError.value =
        caught instanceof ApiError ? caught.message : 'Could not save the ticket. Try again.'
    }
  } finally {
    submitting.value = false
  }
})
</script>

<template>
  <BaseModal
    v-model:open="open"
    :title="isEdit ? 'Edit ticket' : 'New ticket'"
    :busy="submitting"
    width="40rem"
  >
    <form id="ticket-form" class="flex flex-col gap-4" novalidate @submit="onSubmit">
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
        placeholder="e.g. Early Bird General Admission"
        required
        :error="errors.name"
        :disabled="submitting"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseSelect
          v-model="eventId"
          label="Event"
          :options="eventOptions"
          placeholder="Select an event"
          filterable
          required
          :error="errors.eventId"
          :disabled="submitting"
        />
        <BaseSelect
          v-model="categoryId"
          label="Category"
          :options="categoryOptions"
          placeholder="Select a category"
          filterable
          required
          :error="errors.categoryId"
          :disabled="submitting"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-[1fr_7rem_1fr]">
        <BaseMoneyInput
          v-model="priceMinor"
          label="Price"
          :currency="currency ?? 'EUR'"
          required
          :error="errors.priceMinor"
          :disabled="submitting"
        />
        <BaseSelect
          v-model="currency"
          label="Currency"
          :options="currencyOptions"
          required
          :error="errors.currency"
          :disabled="submitting"
        />
        <BaseInput
          v-model="quantityText"
          label="Quantity"
          type="text"
          placeholder="0"
          required
          :error="errors.quantity"
          :disabled="submitting"
        />
      </div>

      <BaseSelect
        v-model="status"
        label="Status"
        :options="TICKET_STATUS_OPTIONS"
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
        <BaseButton type="submit" form="ticket-form" :loading="submitting">
          {{ isEdit ? 'Save changes' : 'Create ticket' }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
