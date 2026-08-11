import { describe, expect, it } from 'vitest'

import { useRowSelection } from '@/shared/composables/useRowSelection'

describe('useRowSelection', () => {
  it('toggle adds an id and removes it on second call', () => {
    const selection = useRowSelection()

    selection.toggle('a')
    expect(selection.isSelected('a')).toBe(true)
    expect(selection.selectedIds.value).toEqual(['a'])

    selection.toggle('a')
    expect(selection.isSelected('a')).toBe(false)
    expect(selection.selectedIds.value).toEqual([])
  })

  it('setMany selects a batch and clears a batch', () => {
    const selection = useRowSelection()

    selection.setMany(['a', 'b', 'c'], true)
    expect(selection.selectedIds.value).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    expect(selection.count.value).toBe(3)

    selection.setMany(['a', 'c'], false)
    expect(selection.selectedIds.value).toEqual(['b'])
  })

  it('clear empties the selection', () => {
    const selection = useRowSelection()

    selection.setMany(['x', 'y'], true)
    selection.clear()

    expect(selection.count.value).toBe(0)
    expect(selection.hasSelection.value).toBe(false)
    expect(selection.selectedIds.value).toEqual([])
  })

  it('areAllSelected returns true only when every id is selected', () => {
    const selection = useRowSelection()

    selection.setMany(['a', 'b'], true)

    expect(selection.areAllSelected(['a', 'b'])).toBe(true)
    expect(selection.areAllSelected(['a', 'b', 'c'])).toBe(false)
  })

  it('areAllSelected returns false for an empty array', () => {
    const selection = useRowSelection()

    selection.setMany(['a'], true)
    expect(selection.areAllSelected([])).toBe(false)
  })

  it('exposes reactive count and hasSelection', () => {
    const selection = useRowSelection()

    expect(selection.hasSelection.value).toBe(false)
    expect(selection.count.value).toBe(0)

    selection.toggle('x')
    expect(selection.hasSelection.value).toBe(true)
    expect(selection.count.value).toBe(1)
  })
})
