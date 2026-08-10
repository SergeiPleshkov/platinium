/** The events feature's public surface. */
export { useEventsStore } from '@/features/events/store'
export { eventSchema, type EventFormValues } from '@/features/events/schema'
export {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_OPTIONS,
  type Event,
  type EventPayload,
  type EventStatus,
} from '@/features/events/types'
