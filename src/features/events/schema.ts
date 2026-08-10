import { z } from 'zod'

import { EVENT_STATUSES } from '@/features/events/types'

const isoDate = z
  .string()
  .trim()
  .min(1, 'Select a date')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date')

export const eventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter an event name')
      .max(120, 'Event name must be 120 characters or fewer'),
    country: z.string().trim().min(1, 'Select a country'),
    venue: z
      .string()
      .trim()
      .min(1, 'Enter a venue')
      .max(120, 'Venue must be 120 characters or fewer'),
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(EVENT_STATUSES, { message: 'Select a status' }),
  })
  /*
   * Cross-field rule. Attached to `endDate` so the message renders against the field the
   * admin needs to change, rather than floating at the top of the form.
   */
  .refine((values) => Date.parse(values.endDate) >= Date.parse(values.startDate), {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })

export type EventFormValues = z.infer<typeof eventSchema>
