/**
 * A CSV reader.
 *
 * Hand-written rather than pulled in, because the requirement is narrow and the correctness
 * conditions are few enough to enumerate and test: quoted fields, commas and newlines *inside*
 * quotes, doubled quotes as an escape, CRLF or LF, and a leading BOM. A dependency would carry
 * dialect options, streaming and type coercion this application will never ask for.
 *
 * It pairs with `src/mocks/csv.ts`, which writes the export. The pairing is the point — a file
 * this application produced must be a file it can read back, and `csv.spec.ts` asserts that
 * round trip rather than assuming it.
 */

/** A parsed row, still entirely strings. Meaning is applied later, against a schema. */
export type CsvRow = string[]

/**
 * Splits CSV text into rows of fields.
 *
 * A character-by-character scan rather than a regular expression: a field may contain the
 * delimiter, the row separator, and the quote character itself, so there is no split that is
 * correct. The parser is a two-state machine — inside quotes, or not.
 */
export function parseCsv(text: string): CsvRow[] {
  // A BOM is invisible and would otherwise become part of the first header's name.
  const input = text.startsWith('\ufeff') ? text.slice(1) : text

  const rows: CsvRow[] = []
  let row: CsvRow = []
  let field = ''
  let quoted = false
  let index = 0

  function endField(): void {
    row.push(field)
    field = ''
  }

  function endRow(): void {
    endField()
    rows.push(row)
    row = []
  }

  while (index < input.length) {
    const char = input[index]!

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }

    if (char === ',') {
      endField()
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      endRow()
      // Consume CRLF as one separator, not two.
      index += char === '\r' && input[index + 1] === '\n' ? 2 : 1
      continue
    }

    field += char
    index += 1
  }

  /*
   * A trailing newline ends the last row rather than starting an empty one. Without this the
   * exporter's own output — which ends in CRLF — would parse with a spurious final row, and
   * every import of a file we wrote would report one bogus failure.
   */
  if (field !== '' || row.length > 0) endRow()

  return rows
}

export interface CsvTable {
  headers: string[]
  /** Data rows only. Each is aligned to `headers` by position. */
  rows: CsvRow[]
}

/**
 * Reads the first row as headers.
 *
 * Headers are trimmed and lower-cased for matching, because a file that has been through a
 * spreadsheet often comes back with different capitalisation and stray spaces — and rejecting
 * it for that would be pedantry, not validation.
 */
export function parseCsvTable(text: string): CsvTable {
  const rows = parseCsv(text)
  const [header, ...rest] = rows

  if (!header) return { headers: [], rows: [] }

  return {
    headers: header.map((cell) => cell.trim().toLowerCase()),
    // A row of nothing but empty cells is what a stray blank line looks like once parsed.
    rows: rest.filter((candidate) => candidate.some((cell) => cell.trim() !== '')),
  }
}

/** Reads one field by header name, or `''` when the column is absent. */
export function cell(table: CsvTable, row: CsvRow, header: string): string {
  const index = table.headers.indexOf(header.toLowerCase())
  return index === -1 ? '' : (row[index] ?? '').trim()
}
