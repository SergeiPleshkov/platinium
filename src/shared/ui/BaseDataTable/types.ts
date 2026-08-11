/**
 * How the grid renders its rows. Mirrors `TableViewMode` in `useTableViewMode`, declared here
 * so `shared/ui` does not have to depend on a composable to state its own prop's type.
 */
export type TableViewMode = 'paginated' | 'virtual'

export interface TableColumn {
  /** Matches the sort key the API accepts, and the `cell-<field>` slot name. */
  field: string
  header: string
  sortable?: boolean | undefined
  /**
   * Fixed track width, e.g. `'12rem'`. Columns without one share what is left over.
   *
   * Only consulted in virtual mode, which lays the table out with `table-layout: fixed`.
   * Automatic layout sizes columns from the rows currently in the DOM, and virtual scrolling
   * keeps replacing those, so the columns visibly resize as you scroll. Declaring the widths
   * is what makes them hold still.
   */
  width?: string | undefined
  /** Extra classes for the cell, e.g. `text-right` for numeric columns. */
  cellClass?: string | undefined
  /**
   * `primary` columns headline the mobile card; `secondary` ones become its label/value
   * rows. Below `md` a table becomes a card list, so every column needs to know its role.
   */
  priority?: 'primary' | 'secondary' | undefined
  /** Omit from the mobile card entirely, for columns that only make sense in a grid. */
  hideOnMobile?: boolean | undefined
}
