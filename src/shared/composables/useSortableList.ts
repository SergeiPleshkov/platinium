import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * A user-arranged order over a fixed set of items, with drag *and* keyboard reordering.
 *
 * The split matters. `reconcile` and `moveTo` are pure functions over arrays of ids — they are
 * where the logic lives and where the tests point. The drag handlers on top are a thin
 * translation of pointer events into `moveTo` calls, and the keyboard handlers are a different
 * translation of the *same* call. Neither input method is privileged, which is the only way a
 * keyboard path stays working: it is not a fallback bolted beside the real feature, it is the
 * same feature reached differently.
 *
 * The order is persisted per key, and reconciled against the canonical list on every read, so
 * an item added or removed in a later release cannot strand a stored order.
 */

export interface UseSortableListOptions {
  /** The items that should exist, in their default order. */
  ids: () => readonly string[]
  /** Where to persist. Omit for an order that lasts only as long as the page. */
  storageKey?: string
  /** Called after every successful move, for a live-region announcement. */
  onMove?: (id: string, position: number, total: number) => void
}

export interface UseSortableList {
  /** The canonical ids in the user's order. */
  order: ComputedRef<string[]>
  /** Id currently being dragged, for styling the source. */
  draggingId: Ref<string | null>
  /** Id currently under the pointer, for showing where it would land. */
  overId: Ref<string | null>
  /** True once the order differs from the default — gates the "reset" affordance. */
  isCustomised: ComputedRef<boolean>
  moveTo: (id: string, index: number) => void
  /** Nudge one place. `-1` and `+1` are what the arrow keys send. */
  moveBy: (id: string, delta: number) => void
  /**
   * Adopts an order wholesale — restoring one saved against the user's account, most
   * obviously. Reconciled like any other, so a stale saved order cannot hide a new widget.
   */
  setOrder: (ids: readonly string[]) => void
  reset: () => void
  /** Spread onto each draggable item. */
  dragHandlers: (id: string) => {
    draggable: true
    onDragstart: (event: DragEvent) => void
    onDragover: (event: DragEvent) => void
    onDragleave: () => void
    onDrop: (event: DragEvent) => void
    onDragend: () => void
  }
}

/**
 * Merges a stored order with the ids that actually exist.
 *
 * Stored ids that no longer exist are dropped; ids the stored order has never seen are
 * appended in their canonical order. A release that adds a fifth tile therefore shows it,
 * rather than hiding it because someone dragged the other four last month.
 */
export function reconcile(stored: readonly string[], canonical: readonly string[]): string[] {
  const known = new Set(canonical)
  const kept = stored.filter((id) => known.has(id))
  const seen = new Set(kept)

  return [...kept, ...canonical.filter((id) => !seen.has(id))]
}

/**
 * Moves one id to an index, closing the gap it left.
 *
 * Removal happens before insertion, so the target index is interpreted against the list as it
 * will be — which is what makes dragging an item *down* land where the pointer is rather than
 * one place short of it.
 */
export function moveTo(order: readonly string[], id: string, index: number): string[] {
  const from = order.indexOf(id)
  if (from === -1) return [...order]

  const without = order.filter((candidate) => candidate !== id)
  const clamped = Math.max(0, Math.min(index, without.length))

  return [...without.slice(0, clamped), id, ...without.slice(clamped)]
}

function readStored(storageKey: string | undefined): string[] {
  if (!storageKey) return []

  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    // Unparseable or unavailable. The default order is always a correct answer.
    return []
  }
}

export function useSortableList(options: UseSortableListOptions): UseSortableList {
  const stored = ref<string[]>(readStored(options.storageKey))

  const draggingId = ref<string | null>(null)
  const overId = ref<string | null>(null)

  const order = computed(() => reconcile(stored.value, options.ids()))

  function persist(next: string[]): void {
    stored.value = next
    if (!options.storageKey) return

    try {
      localStorage.setItem(options.storageKey, JSON.stringify(next))
    } catch {
      /* Storage unavailable — the arrangement still applies for this page. */
    }
  }

  function apply(id: string, index: number): void {
    const next = moveTo(order.value, id, index)
    if (next.join() === order.value.join()) return

    persist(next)
    options.onMove?.(id, next.indexOf(id) + 1, next.length)
  }

  return {
    order,
    draggingId,
    overId,
    isCustomised: computed(() => order.value.join() !== options.ids().join()),

    moveTo: apply,
    moveBy: (id, delta) => apply(id, order.value.indexOf(id) + delta),
    setOrder: (ids) => persist(reconcile(ids, options.ids())),

    reset() {
      persist([])
      if (options.storageKey) {
        try {
          localStorage.removeItem(options.storageKey)
        } catch {
          /* Nothing to undo if it was never written. */
        }
      }
    },

    dragHandlers: (id) => ({
      draggable: true,

      onDragstart(event) {
        draggingId.value = id
        /*
         * Firefox refuses to start a drag unless `dataTransfer` carries something. The value
         * is never read back — the id is already in `draggingId` — but the call is required.
         */
        event.dataTransfer?.setData('text/plain', id)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },

      onDragover(event) {
        // Without `preventDefault` the element is not a valid drop target and `drop` never fires.
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        if (draggingId.value !== null && draggingId.value !== id) overId.value = id
      },

      onDragleave() {
        if (overId.value === id) overId.value = null
      },

      onDrop(event) {
        event.preventDefault()
        const source = draggingId.value
        draggingId.value = null
        overId.value = null

        if (source === null || source === id) return
        apply(source, order.value.indexOf(id))
      },

      onDragend() {
        draggingId.value = null
        overId.value = null
      },
    }),
  }
}
