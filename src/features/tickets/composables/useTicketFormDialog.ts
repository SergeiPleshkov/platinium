import { useForm } from 'vee-validate'
import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useCategoriesStore } from '@/features/categories'
import { useEventsStore } from '@/features/events'
import { ticketSchema, type TicketFormValues } from '@/features/tickets/schema'
import { useTicketsStore } from '@/features/tickets/store'
import type { TicketWithRelations } from '@/features/tickets/types'
import { useAsyncAction, useNotifications, useRelationOptionsLoader } from '@/shared/composables'
import { CURRENCIES, type CurrencyCode } from '@/shared/utils/money'
import { zodSchema } from '@/shared/validation/zodSchema'

/**
 * Form state for create/edit ticket. Lives here so the dialog component stays presentational
 * and under the ~120-line script budget.
 */
export function useTicketFormDialog(args: {
  ticket: MaybeRefOrGetter<TicketWithRelations | null | undefined>
  open: Ref<boolean>
  onSaved: (ticket: TicketWithRelations) => void
}) {
  const store = useTicketsStore()
  const eventsStore = useEventsStore()
  const categoriesStore = useCategoriesStore()
  const notifications = useNotifications()

  const isEdit = computed(() => toValue(args.ticket) !== null)

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
   * Quantity is bound as text so an empty field stays distinguishable from a deliberate 0 —
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

  const { load: loadEventOptions } = useRelationOptionsLoader({
    fetchOptions: (opts) => eventsStore.fetchOptions(opts),
    selectedId: eventId,
    fallback: () => toValue(args.ticket)?.event ?? null,
    currentOptions: () => eventsStore.options,
  })

  const { load: loadCategoryOptions } = useRelationOptionsLoader({
    fetchOptions: (opts) => categoriesStore.fetchOptions(opts),
    selectedId: categoryId,
    fallback: () => toValue(args.ticket)?.category ?? null,
    currentOptions: () => categoriesStore.options,
  })

  const save = useAsyncAction(
    (values: TicketFormValues) => {
      const ticket = toValue(args.ticket)
      return ticket ? store.update(ticket.id, values) : store.create(values)
    },
    {
      onSuccess: (saved) => {
        notifications.success(
          isEdit.value ? 'Ticket updated' : 'Ticket created',
          `“${saved.name}” has been saved.`,
        )
        args.open.value = false
        args.onSaved(saved)
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
    () => [args.open.value, toValue(args.ticket)] as const,
    ([isOpen, ticket]) => {
      if (!isOpen) return
      save.reset()

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

      // After reset so pins see the restored ids.
      loadEventOptions()
      loadCategoryOptions()
    },
    { immediate: true },
  )

  return {
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
    onSubmit: handleSubmit((values) => save.run(values)),
  }
}
