import { z } from 'zod'

import { TICKET_STATUSES } from '@/features/tickets/types'
import { CURRENCIES } from '@/shared/utils/money'

/** Ten million minor units — a sanity ceiling that catches a misplaced decimal point. */
const MAX_PRICE_MINOR = 10_000_000

export const ticketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a ticket name')
    .max(120, 'Ticket name must be 120 characters or fewer'),
  /*
   * The form binds a major-unit text input and converts with `parseMoney`; what reaches this
   * schema is already an integer count of minor units.
   */
  priceMinor: z
    .number({ message: 'Enter a price' })
    .int('Enter a price with at most two decimal places')
    .min(0, 'Price cannot be negative')
    .max(MAX_PRICE_MINOR, 'Price looks too high — check the decimal point'),
  currency: z.enum(CURRENCIES, { message: 'Select a currency' }),
  quantity: z
    .number({ message: 'Enter a quantity' })
    .int('Quantity must be a whole number')
    .min(0, 'Quantity cannot be negative')
    .max(1_000_000, 'Quantity must be 1,000,000 or fewer'),
  status: z.enum(TICKET_STATUSES, { message: 'Select a status' }),
  eventId: z.string().trim().min(1, 'Choose the event this ticket belongs to'),
  categoryId: z.string().trim().min(1, 'Choose a category for this ticket'),
})

export type TicketFormValues = z.infer<typeof ticketSchema>
