/**
 * Fields every persisted record carries. Timestamps are ISO-8601 strings at the boundary and
 * stay strings in the store — they are parsed only inside formatting helpers, so no `Date`
 * ever leaks into state where it would break serialisation and equality checks.
 */
export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

/** The shape a create/update payload takes: the entity minus everything the server owns. */
export type EntityPayload<T extends BaseEntity> = Omit<T, keyof BaseEntity>

/** A minimal reference to a related record, embedded so lists can render names, not ids. */
export interface EntityRef {
  id: string
  name: string
}
