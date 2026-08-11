import type { BaseEntity, EntityRef } from '@/shared/types/entity'
import type { CurrencyCode } from '@/shared/utils/money'

export const TICKET_STATUSES = ['draft', 'on_sale', 'paused', 'sold_out'] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export interface Ticket extends BaseEntity {
  name: string
  /**
   * Integer, in the currency's minor unit (cents/pence). Never a float major amount
   * see `@/shared/utils/money`.
   */
  priceMinor: number
  currency: CurrencyCode
  quantity: number
  status: TicketStatus
  eventId: string
  categoryId: string
}

/**
 * What list and detail endpoints actually return. Relations arrive embedded so a table can
 * render "Summer Gala" instead of `evt_017` without a request per row.
 */
export interface TicketWithRelations extends Ticket {
  event: EntityRef
  category: EntityRef
}

export interface TicketPayload {
  name: string
  priceMinor: number
  currency: CurrencyCode
  quantity: number
  status: TicketStatus
  eventId: string
  categoryId: string
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  draft: 'Draft',
  on_sale: 'On sale',
  paused: 'Paused',
  sold_out: 'Sold out',
}

/** Status → badge tone. The label always carries the meaning; colour only reinforces it. */
export const TICKET_STATUS_TONES = {
  draft: 'neutral',
  on_sale: 'success',
  paused: 'warning',
  sold_out: 'danger',
} as const satisfies Record<TicketStatus, 'neutral' | 'success' | 'info' | 'warning' | 'danger'>

export const TICKET_STATUS_OPTIONS = TICKET_STATUSES.map((status) => ({
  value: status,
  label: TICKET_STATUS_LABELS[status],
}))
