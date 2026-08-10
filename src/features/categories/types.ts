import type { BaseEntity } from '@/shared/types/entity'

export interface Category extends BaseEntity {
  name: string
  description: string
  /** Denormalised by the API so the list can show usage without an N+1 of requests. */
  ticketCount: number
}

export interface CategoryPayload {
  name: string
  description: string
}
