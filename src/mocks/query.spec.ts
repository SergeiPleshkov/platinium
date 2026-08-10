import { describe, expect, it } from 'vitest'

import { runQuery, type QueryConfig } from '@/mocks/query'

interface Row {
  id: string
  name: string
  city: string
  price: number
  status: 'draft' | 'live'
}

const rows: Row[] = [
  { id: '1', name: 'Alpha', city: 'Paris', price: 300, status: 'live' },
  { id: '2', name: 'Bravo', city: 'Berlin', price: 100, status: 'draft' },
  { id: '3', name: 'Charlie', city: 'Paris', price: 200, status: 'live' },
  { id: '4', name: 'Item 10', city: 'Madrid', price: 200, status: 'draft' },
  { id: '5', name: 'Item 2', city: 'Madrid', price: 500, status: 'live' },
]

const config: QueryConfig<Row> = {
  searchable: (row) => [row.name, row.city],
  filters: {
    status: (row, value) => row.status === value,
    city: (row, value) => row.city === value,
  },
  sortable: {
    name: (row) => row.name,
    price: (row) => row.price,
    id: (row) => row.id,
  },
  defaultSort: 'id',
}

function query(search: string): ReturnType<typeof runQuery<Row>> {
  return runQuery(rows, new URL(`http://localhost/api/rows?${search}`), config)
}

/**
 * Pins the order to ascending id, for tests that care *which* rows come back rather than in
 * what order. Without this they would be asserting against the default `desc`, which makes
 * the expectations read backwards for no reason.
 */
function queryStable(search: string): ReturnType<typeof runQuery<Row>> {
  return query(`${search}&sort=id&order=asc`)
}

describe('runQuery', () => {
  describe('search', () => {
    it('matches case-insensitively across every searchable field', () => {
      expect(queryStable('search=paris').data.map((row) => row.id)).toEqual(['1', '3'])
      expect(queryStable('search=BRAVO').data.map((row) => row.id)).toEqual(['2'])
    })

    it('matches on a substring', () => {
      expect(queryStable('search=harl').data.map((row) => row.id)).toEqual(['3'])
    })

    it('returns nothing for a term that matches nothing', () => {
      const result = queryStable('search=zzz')
      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
    })
  })

  describe('filters', () => {
    it('applies a single filter', () => {
      expect(queryStable('status=live').data.map((row) => row.id)).toEqual(['1', '3', '5'])
    })

    it('ORs repeated values within one field', () => {
      expect(queryStable('city=Paris&city=Madrid').data.map((row) => row.id)).toEqual([
        '1',
        '3',
        '4',
        '5',
      ])
    })

    it('ANDs across different fields', () => {
      expect(queryStable('city=Paris&status=draft').data).toEqual([])
      expect(queryStable('city=Madrid&status=live').data.map((row) => row.id)).toEqual(['5'])
    })

    it('ignores an empty filter value rather than matching nothing', () => {
      expect(queryStable('status=').meta.total).toBe(rows.length)
    })

    it('combines search and filters', () => {
      expect(queryStable('search=item&status=draft').data.map((row) => row.id)).toEqual(['4'])
    })
  })

  describe('sort', () => {
    it('sorts descending by default', () => {
      expect(query('sort=price').data.map((row) => row.price)).toEqual([500, 300, 200, 200, 100])
    })

    it('sorts ascending when asked', () => {
      expect(query('sort=price&order=asc').data.map((row) => row.price)).toEqual([
        100, 200, 200, 300, 500,
      ])
    })

    it('orders embedded numbers naturally, not lexicographically', () => {
      // A plain string sort would put "Item 10" before "Item 2".
      const names = query('sort=name&order=asc').data.map((row) => row.name)
      expect(names.indexOf('Item 2')).toBeLessThan(names.indexOf('Item 10'))
    })

    it('breaks ties stably so equal values never shuffle between requests', () => {
      const first = query('sort=price&order=asc').data.map((row) => row.id)
      const second = query('sort=price&order=asc').data.map((row) => row.id)
      expect(first).toEqual(second)
      // The two 200s stay in default-sort order.
      expect(first.slice(1, 3)).toEqual(['3', '4'])
    })

    it('falls back to the default sort for an unknown key instead of failing', () => {
      const result = query('sort=nonsense')
      expect(result.query.sort).toBe('id')
      expect(result.data).toHaveLength(rows.length)
    })

    it('does not mutate the source collection', () => {
      const before = rows.map((row) => row.id)
      query('sort=price&order=asc')
      expect(rows.map((row) => row.id)).toEqual(before)
    })
  })

  describe('pagination', () => {
    it('slices the requested page and reports accurate meta', () => {
      const result = query('sort=id&order=asc&page=2&perPage=2')

      expect(result.data.map((row) => row.id)).toEqual(['3', '4'])
      expect(result.meta).toEqual({ total: 5, page: 2, perPage: 2, totalPages: 3 })
    })

    it('reports total for the filtered set, not the whole collection', () => {
      const result = query('status=live&perPage=2')

      expect(result.meta.total).toBe(3)
      expect(result.meta.totalPages).toBe(2)
      expect(result.data).toHaveLength(2)
    })

    it('clamps a page beyond the end to the last page', () => {
      // Deleting the last row on page 4 should show page 3, not an empty table.
      const result = query('sort=id&order=asc&page=99&perPage=2')

      expect(result.meta.page).toBe(3)
      expect(result.data.map((row) => row.id)).toEqual(['5'])
    })

    it('caps perPage so a client cannot dump the whole table', () => {
      expect(query('perPage=100000').meta.perPage).toBe(100)
    })

    it.each([
      ['page=0', 1],
      ['page=-3', 1],
      ['page=abc', 1],
    ])('falls back to page 1 for %s', (search, expected) => {
      expect(query(search).meta.page).toBe(expected)
    })

    it('reports one page for an empty result rather than zero', () => {
      const result = query('search=zzz')
      expect(result.meta.totalPages).toBe(1)
      expect(result.meta.page).toBe(1)
    })
  })
})
