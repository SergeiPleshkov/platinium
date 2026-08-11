/**
 * CSV serialisation for the mock backend's export endpoints.
 *
 * Lives on the server side deliberately. Building the file in the browser would mean first
 * fetching every matching row into memory, the exact pattern the list views avoid, and it
 * caps the export at whatever the client can hold. A real backend streams this.
 */

/**
 * Escapes one field per RFC 4180.
 *
 * The leading apostrophe on `=+-@` is CSV-injection defence: a spreadsheet treats a cell
 * starting with those as a formula, so an exported value like `=cmd|...` becomes executable
 * when the file is opened. Prefixing forces it to be read as text.
 */
export type CsvValue = string | number | boolean | null | undefined

export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''

  const raw = String(value)
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw

  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export interface CsvColumn<TRow> {
  header: string
  value: (row: TRow) => CsvValue
}

/**
 * Renders rows as CSV text with a header line and CRLF endings.
 *
 * A UTF-8 BOM is prepended because Excel on Windows otherwise reads the file as the local
 * codepage and mangles every non-ASCII character, event names here include `Palais des
 * Congrès` and `Ziggo Dome`, so this is not hypothetical.
 */
export function toCsv<TRow>(
  rows: readonly TRow[],
  columns: ReadonlyArray<CsvColumn<TRow>>,
): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(',')
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvField(column.value(row))).join(','),
  )

  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`
}
