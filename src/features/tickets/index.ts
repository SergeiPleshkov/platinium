/** The tickets feature's public surface. */
export { useTicketsStore } from '@/features/tickets/store'
export { ticketSchema, type TicketFormValues } from '@/features/tickets/schema'
export {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_OPTIONS,
  type Ticket,
  type TicketPayload,
  type TicketStatus,
  type TicketWithRelations,
} from '@/features/tickets/types'
