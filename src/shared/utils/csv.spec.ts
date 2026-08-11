import { describe, expect, it } from 'vitest'

import { escapeCsvField, toCsv } from '@/mocks/csv'
import { cell, parseCsv, parseCsvTable } from '@/shared/utils/csv'

/**
 * The CSV reader, and its round trip with the writer.
 *
 * The round-trip tests at the bottom are the ones worth having: a file this application
 * produced must be a file it can read back. Testing the parser only against hand-written
 * fixtures would leave the two free to drift, a BOM here, a CRLF there, and the symptom
 * would be an import that reports every row as broken.
 */

describe('parseCsv', () => {
  it('splits a plain row', () => {
    expect(parseCsv('a,b,c')).toEqual([['a', 'b', 'c']])
  })

  it('reads several rows', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it.each([
    ['LF', 'a\nb'],
    ['CRLF', 'a\r\nb'],
    ['CR', 'a\rb'],
  ])('treats %s as one row separator', (_name, input) => {
    expect(parseCsv(input)).toEqual([['a'], ['b']])
  })

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('"a,b",c')).toEqual([['a,b', 'c']])
  })

  it('keeps a newline inside quotes', () => {
    // The case a line-based parser gets wrong, and the reason this is a character scan.
    expect(parseCsv('"line one\nline two",next')).toEqual([['line one\nline two', 'next']])
  })

  it('unescapes a doubled quote', () => {
    expect(parseCsv('"He said ""hi""",x')).toEqual([['He said "hi"', 'x']])
  })

  it('preserves empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })

  it('strips a leading BOM rather than making it part of the first header', () => {
    // Excel writes one. Left in place it becomes part of the first header's name.
    expect(parseCsv('\ufeffName,Count')).toEqual([['Name', 'Count']])
  })

  it('does not invent a final row from a trailing newline', () => {
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']])
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('parseCsvTable', () => {
  const text = 'Name,Quantity\r\nVIP,10\r\nGeneral,25\r\n'

  it('takes the first row as headers', () => {
    expect(parseCsvTable(text).headers).toEqual(['name', 'quantity'])
  })

  it('normalises header case and spacing', () => {
    // A file that has been through a spreadsheet often comes back reformatted.
    expect(parseCsvTable('  Name , QUANTITY \nx,1').headers).toEqual(['name', 'quantity'])
  })

  it('returns only the data rows', () => {
    expect(parseCsvTable(text).rows).toHaveLength(2)
  })

  it('drops blank lines rather than reporting them as broken rows', () => {
    expect(parseCsvTable('Name\r\nVIP\r\n\r\nGeneral\r\n').rows).toEqual([['VIP'], ['General']])
  })

  it('copes with a header-only file', () => {
    expect(parseCsvTable('Name,Quantity')).toEqual({ headers: ['name', 'quantity'], rows: [] })
  })

  it('copes with no file at all', () => {
    expect(parseCsvTable('')).toEqual({ headers: [], rows: [] })
  })
})

describe('cell', () => {
  const table = parseCsvTable('Name,Quantity\nVIP, 10 ')

  it('reads by header name, case-insensitively', () => {
    expect(cell(table, table.rows[0]!, 'Name')).toBe('VIP')
  })

  it('trims the value', () => {
    expect(cell(table, table.rows[0]!, 'Quantity')).toBe('10')
  })

  it('returns empty for a column the file does not have', () => {
    expect(cell(table, table.rows[0]!, 'Currency')).toBe('')
  })
})

describe('round trip with the exporter', () => {
  interface Row {
    name: string
    note: string
    count: number
  }

  const columns = [
    { header: 'Name', value: (row: Row) => row.name },
    { header: 'Note', value: (row: Row) => row.note },
    { header: 'Count', value: (row: Row) => row.count },
  ]

  it('reads back a file it wrote', () => {
    const original: Row[] = [
      { name: 'VIP', note: 'Simple', count: 1 },
      { name: 'Palais des Congrès', note: 'Accented', count: 2 },
      { name: 'Comma, inside', note: 'He said "hi"', count: 3 },
      { name: 'Line\nbreak', note: '', count: 4 },
    ]

    const table = parseCsvTable(toCsv(original, columns))

    expect(table.headers).toEqual(['name', 'note', 'count'])
    expect(table.rows.map((row) => row[0])).toEqual([
      'VIP',
      'Palais des Congrès',
      'Comma, inside',
      'Line\nbreak',
    ])
    expect(table.rows.map((row) => row[1])).toEqual(['Simple', 'Accented', 'He said "hi"', ''])
  })

  it('survives the BOM and CRLF the exporter deliberately writes', () => {
    const csv = toCsv([{ name: 'A', note: 'B', count: 1 }], columns)

    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv).toContain('\r\n')
    expect(parseCsvTable(csv).rows).toEqual([['A', 'B', '1']])
  })

  it('reads back the formula guard as written, apostrophe and all', () => {
    /*
     * The exporter prefixes `=+-@` to stop a spreadsheet evaluating the cell. The parser does
     * not strip it: that is the writer's decision to undo, and silently removing a character
     * the file genuinely contains would be worse than showing it.
     */
    const guarded = escapeCsvField('=1+1')
    expect(parseCsv(guarded)).toEqual([["'=1+1"]])
  })
})
