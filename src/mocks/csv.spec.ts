import { describe, expect, it } from 'vitest'

import { escapeCsvField, toCsv } from '@/mocks/csv'

describe('escapeCsvField', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCsvField('Summer Gala')).toBe('Summer Gala')
  })

  it('renders null and undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it.each([
    ['a,b', '"a,b"', 'comma'],
    ['a\nb', '"a\nb"', 'newline'],
    ['a\r\nb', '"a\r\nb"', 'CRLF'],
  ])('quotes %j → %j (%s)', (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected)
  })

  it('doubles embedded quotes and wraps the field', () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""')
  })

  describe('formula injection', () => {
    it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('neutralises a cell starting with %j', (input) => {
      // A spreadsheet would otherwise evaluate this on open.
      expect(escapeCsvField(input)).toBe(`'${input}`)
    })

    it('quotes as well when the guarded value also needs it', () => {
      expect(escapeCsvField('=a,b')).toBe(`"'=a,b"`)
    })

    it('does not touch a value that merely contains an equals sign', () => {
      expect(escapeCsvField('width=10')).toBe('width=10')
    })
  })
})

describe('toCsv', () => {
  interface Row {
    name: string
    count: number
  }

  const columns = [
    { header: 'Name', value: (row: Row) => row.name },
    { header: 'Count', value: (row: Row) => row.count },
  ]

  it('writes a header row followed by the data', () => {
    const csv = toCsv([{ name: 'VIP', count: 3 }], columns)

    expect(csv).toBe('\uFEFFName,Count\r\nVIP,3\r\n')
  })

  it('starts with a UTF-8 BOM so Excel reads accents correctly', () => {
    // Without it, "Palais des Congrès" arrives mangled on Windows.
    const csv = toCsv([{ name: 'Palais des Congrès', count: 1 }], columns)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Palais des Congrès')
  })

  it('uses CRLF line endings', () => {
    const csv = toCsv(
      [
        { name: 'a', count: 1 },
        { name: 'b', count: 2 },
      ],
      columns,
    )

    expect(csv.split('\r\n')).toHaveLength(4) // BOM+header, two rows, trailing empty
  })

  it('emits a header-only file for an empty result', () => {
    expect(toCsv([], columns)).toBe('\uFEFFName,Count\r\n')
  })
})
