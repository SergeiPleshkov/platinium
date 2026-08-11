import type { BaseEntity } from '@/shared/types/entity'

export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'] as const

export type EventStatus = (typeof EVENT_STATUSES)[number]

export interface Event extends BaseEntity {
  name: string
  country: string
  venue: string
  /** ISO-8601 date-time. Kept as a string in state, see `BaseEntity`. */
  startDate: string
  endDate: string
  status: EventStatus
  /** Denormalised by the API; drives the delete guard and the dashboard. */
  ticketCount: number
}

export interface EventPayload {
  name: string
  country: string
  venue: string
  startDate: string
  endDate: string
  status: EventStatus
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

/**
 * Status → badge tone. Colour is a secondary signal only; the label always carries the
 * meaning, so this table can change without anything becoming unreadable.
 */
export const EVENT_STATUS_TONES = {
  draft: 'neutral',
  published: 'success',
  cancelled: 'danger',
  completed: 'info',
} as const satisfies Record<EventStatus, 'neutral' | 'success' | 'info' | 'warning' | 'danger'>

export const EVENT_STATUS_OPTIONS = EVENT_STATUSES.map((status) => ({
  value: status,
  label: EVENT_STATUS_LABELS[status],
}))
