<script setup lang="ts">
import { useTicketFormDialog } from '@/features/tickets/composables/useTicketFormDialog'
import { TICKET_STATUS_OPTIONS, type TicketWithRelations } from '@/features/tickets/types'
import { BaseButton, BaseInput, BaseModal, BaseMoneyInput, BaseSelect } from '@/shared/ui'

/**
 * Create and edit a ticket.
 *
 * The relation pickers read from the events and categories stores through their public
 * barrels, the only sanctioned way one feature reaches another's data. Options are loaded
 * with server-backed search so names past the first page stay findable.
 */

interface Props {
  ticket?: TicketWithRelations | null | undefined
}

const props = withDefaults(defineProps<Props>(), { ticket: null })

const emit = defineEmits<{ saved: [ticket: TicketWithRelations] }>()

const open = defineModel<boolean>('open', { required: true })

const {
  isEdit,
  errors,
  name,
  priceMinor,
  currency,
  quantityText,
  status,
  eventId,
  categoryId,
  eventOptions,
  categoryOptions,
  currencyOptions,
  loadEventOptions,
  loadCategoryOptions,
  formError,
  submitting,
  onSubmit,
} = useTicketFormDialog({
  ticket: () => props.ticket,
  open,
  onSaved: (ticket) => emit('saved', ticket),
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
          :on-filter="loadEventOptions"
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
          :on-filter="loadCategoryOptions"
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
