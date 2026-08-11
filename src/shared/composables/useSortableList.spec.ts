import { beforeEach, describe, expect, it, vi } from 'vitest'

import { moveTo, reconcile, useSortableList } from '@/shared/composables/useSortableList'

/**
 * User-arranged ordering.
 *
 * `moveTo` and `reconcile` get the bulk of the attention because they are where the mistakes
 * live — off-by-one when dragging downwards, and a stored order outliving the items it refers
 * to. The drag handlers are a thin translation on top and are tested for the two things that
 * are easy to omit and silently break the feature: `preventDefault` on `dragover`, and putting
 * something in `dataTransfer`.
 */

const KEY = 'test.order'

beforeEach(() => {
  localStorage.clear()
})

describe('moveTo', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves an item earlier', () => {
    expect(moveTo(order, 'c', 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves an item later, landing where the target was', () => {
    /*
     * The off-by-one that a naive splice produces. Removing first means index 2 refers to the
     * list *after* removal, which is where the pointer actually is.
     */
    expect(moveTo(order, 'a', 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item to the end', () => {
    expect(moveTo(order, 'a', 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('is a no-op when the item is already there', () => {
    expect(moveTo(order, 'b', 1)).toEqual(order)
  })

  it('clamps an index past the end', () => {
    expect(moveTo(order, 'a', 99)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('clamps a negative index', () => {
    expect(moveTo(order, 'd', -5)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('leaves the list alone for an unknown id', () => {
    expect(moveTo(order, 'z', 0)).toEqual(order)
  })

  it('does not mutate its input', () => {
    const original = [...order]
    moveTo(order, 'a', 3)

    expect(order).toEqual(original)
  })
})

describe('reconcile', () => {
  it('uses the stored order when it covers everything', () => {
    expect(reconcile(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('appends an item the stored order has never seen', () => {
    // A release that adds a fifth tile must show it, not hide it behind last month's drag.
    expect(reconcile(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('drops a stored item that no longer exists', () => {
    expect(reconcile(['gone', 'b', 'a'], ['a', 'b'])).toEqual(['b', 'a'])
  })

  it('falls back to the canonical order when nothing is stored', () => {
    expect(reconcile([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('appends several new items in their canonical order', () => {
    expect(reconcile(['c'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('useSortableList', () => {
  const ids = () => ['a', 'b', 'c']

  it('starts in the canonical order', () => {
    const list = useSortableList({ ids })

    expect(list.order.value).toEqual(['a', 'b', 'c'])
    expect(list.isCustomised.value).toBe(false)
  })

  it('reports a customised order once something moves', () => {
    const list = useSortableList({ ids })

    list.moveBy('a', 1)

    expect(list.order.value).toEqual(['b', 'a', 'c'])
    expect(list.isCustomised.value).toBe(true)
  })

  it('persists the order', () => {
    const list = useSortableList({ ids, storageKey: KEY })
    list.moveTo('c', 0)

    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['c', 'a', 'b'])
  })

  it('restores a persisted order', () => {
    localStorage.setItem(KEY, JSON.stringify(['b', 'c', 'a']))

    expect(useSortableList({ ids, storageKey: KEY }).order.value).toEqual(['b', 'c', 'a'])
  })

  it('ignores a corrupt stored value rather than breaking the page', () => {
    localStorage.setItem(KEY, 'not json at all')

    expect(useSortableList({ ids, storageKey: KEY }).order.value).toEqual(['a', 'b', 'c'])
  })

  it('ignores a stored value that is not an array of strings', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))

    expect(useSortableList({ ids, storageKey: KEY }).order.value).toEqual(['a', 'b', 'c'])
  })

  it('keeps no order at all when given no storage key', () => {
    const list = useSortableList({ ids })
    list.moveBy('a', 1)

    expect(localStorage.length).toBe(0)
  })

  it('resets to the default and forgets the stored order', () => {
    const list = useSortableList({ ids, storageKey: KEY })
    list.moveBy('a', 2)

    list.reset()

    expect(list.order.value).toEqual(['a', 'b', 'c'])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  describe('moveBy', () => {
    it('refuses to move the first item earlier', () => {
      const list = useSortableList({ ids })
      list.moveBy('a', -1)

      // Clamped, not wrapped: an arrow key at the edge should do nothing, not teleport.
      expect(list.order.value).toEqual(['a', 'b', 'c'])
    })

    it('refuses to move the last item later', () => {
      const list = useSortableList({ ids })
      list.moveBy('c', 1)

      expect(list.order.value).toEqual(['a', 'b', 'c'])
    })
  })

  describe('announcements', () => {
    it('reports the new position and the total', () => {
      const onMove = vi.fn()
      const list = useSortableList({ ids, onMove })

      list.moveBy('a', 1)

      expect(onMove).toHaveBeenCalledWith('a', 2, 3)
    })

    it('stays silent when nothing actually moved', () => {
      // An arrow key at the edge must not announce a move that did not happen.
      const onMove = vi.fn()
      const list = useSortableList({ ids, onMove })

      list.moveBy('a', -1)

      expect(onMove).not.toHaveBeenCalled()
    })
  })

  describe('drag handlers', () => {
    function dragEvent(): DragEvent {
      return {
        preventDefault: vi.fn(),
        dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' },
      } as unknown as DragEvent
    }

    it('puts something in dataTransfer, which Firefox requires to start a drag', () => {
      const list = useSortableList({ ids })
      const event = dragEvent()

      list.dragHandlers('a').onDragstart(event)

      expect(event.dataTransfer?.setData).toHaveBeenCalledWith('text/plain', 'a')
      expect(list.draggingId.value).toBe('a')
    })

    it('prevents the default on dragover, without which drop never fires', () => {
      const list = useSortableList({ ids })
      const event = dragEvent()

      list.dragHandlers('b').onDragover(event)

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('marks the hovered item as the drop target', () => {
      const list = useSortableList({ ids })
      list.dragHandlers('a').onDragstart(dragEvent())

      list.dragHandlers('c').onDragover(dragEvent())

      expect(list.overId.value).toBe('c')
    })

    it('does not mark the dragged item as its own drop target', () => {
      const list = useSortableList({ ids })
      list.dragHandlers('a').onDragstart(dragEvent())

      list.dragHandlers('a').onDragover(dragEvent())

      expect(list.overId.value).toBeNull()
    })

    it('reorders on drop', () => {
      const list = useSortableList({ ids })
      list.dragHandlers('a').onDragstart(dragEvent())

      list.dragHandlers('c').onDrop(dragEvent())

      expect(list.order.value).toEqual(['b', 'c', 'a'])
    })

    it('clears the drag state on drop', () => {
      const list = useSortableList({ ids })
      list.dragHandlers('a').onDragstart(dragEvent())
      list.dragHandlers('c').onDrop(dragEvent())

      expect(list.draggingId.value).toBeNull()
      expect(list.overId.value).toBeNull()
    })

    it('clears the drag state on a cancelled drag', () => {
      // Dropped outside the list, or Escape pressed. Without this the tile stays dimmed.
      const list = useSortableList({ ids })
      list.dragHandlers('a').onDragstart(dragEvent())

      list.dragHandlers('a').onDragend()

      expect(list.draggingId.value).toBeNull()
      expect(list.order.value).toEqual(['a', 'b', 'c'])
    })

    it('does nothing when dropped on itself', () => {
      const list = useSortableList({ ids })
      list.dragHandlers('b').onDragstart(dragEvent())

      list.dragHandlers('b').onDrop(dragEvent())

      expect(list.order.value).toEqual(['a', 'b', 'c'])
    })
  })
})
