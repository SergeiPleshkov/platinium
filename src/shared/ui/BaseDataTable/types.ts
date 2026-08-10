export interface TableColumn {
  /** Matches the sort key the API accepts, and the `cell-<field>` slot name. */
  field: string
  header: string
  sortable?: boolean | undefined
  /** Extra classes for the cell, e.g. `text-right` for numeric columns. */
  cellClass?: string | undefined
  /**
   * `primary` columns headline the mobile card; `secondary` ones become its label/value
   * rows. Below `md` a table becomes a card list, so every column needs to know its role.
   */
  priority?: 'primary' | 'secondary' | undefined
  /** Omit from the mobile card entirely — for columns that only make sense in a grid. */
  hideOnMobile?: boolean | undefined
}
