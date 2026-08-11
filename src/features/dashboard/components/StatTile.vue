<script setup lang="ts">
import { BaseSkeleton } from '@/shared/ui'

/**
 * A single headline figure.
 *
 * Rendered as a definition list so the label and value are programmatically associated —
 * a big number with a small word above it is only a statistic to someone who can see the
 * layout.
 *
 * When `sortable`, it grows a drag handle. The handle is a real `<button>`, not a styled
 * `<div>` with a grab cursor: it has to be reachable by keyboard, because HTML5 drag and drop
 * is a pointer gesture with no keyboard equivalent at all. Arrow keys on the handle emit the
 * same `move` this component's drag emits.
 */

interface Props {
  label: string
  /** A single headline figure. Ignored when `values` is supplied. */
  value?: string | undefined
  /**
   * Several figures that must not be combined — per-currency totals, most obviously.
   * Stacked and set smaller, because three long amounts at headline size stop being scannable.
   */
  values?: readonly string[] | undefined
  detail?: string | undefined
  icon?: string | undefined
  loading?: boolean | undefined
  /** Adds the drag handle and the keyboard reordering it carries. */
  sortable?: boolean | undefined
  /** Dimmed while it is the one being dragged. */
  isDragging?: boolean | undefined
  /** Outlined while the dragged tile would land here. */
  isDropTarget?: boolean | undefined
  position?: number | undefined
  total?: number | undefined
}

withDefaults(defineProps<Props>(), {
  loading: false,
  sortable: false,
  isDragging: false,
  isDropTarget: false,
})

const emit = defineEmits<{ move: [delta: number] }>()

/**
 * Arrow keys nudge the tile one place.
 *
 * Both axes are accepted because the tiles reflow: they are a single row at `xl`, two columns
 * at `sm`, and one column below that — so "the next tile" is to the right on a desktop and
 * below on a phone, and a user should not have to work out which.
 */
function onKeydown(event: KeyboardEvent): void {
  const delta =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0

  if (delta === 0) return

  event.preventDefault()
  emit('move', delta)
}
</script>

<template>
  <div
    :class="[
      'relative rounded-lg border bg-surface-0 p-4 transition-all dark:bg-surface-900',
      isDropTarget ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-border',
      isDragging ? 'opacity-40' : '',
    ]"
  >
    <dl>
      <dt class="flex items-center gap-2 text-sm text-content-muted">
        <i v-if="icon" :class="icon" aria-hidden="true" />
        {{ label }}
        <button
          v-if="sortable"
          type="button"
          class="ml-auto cursor-grab rounded p-1 text-content-muted hover:bg-surface-100 hover:text-content focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:cursor-grabbing dark:hover:bg-surface-800"
          :aria-label="`Reorder ${label} — currently ${position} of ${total}. Use the arrow keys to move it.`"
          @keydown="onKeydown"
        >
          <i class="pi pi-bars text-xs" aria-hidden="true" />
        </button>
      </dt>
      <dd class="mt-2">
        <BaseSkeleton v-if="loading" width="5rem" height="1.75rem" />
        <ul v-else-if="values?.length" class="flex flex-col gap-0.5">
          <li
            v-for="entry in values"
            :key="entry"
            class="text-base font-semibold tabular-nums text-content"
          >
            {{ entry }}
          </li>
        </ul>
        <span v-else class="text-2xl font-semibold tabular-nums text-content">{{ value }}</span>
      </dd>
      <dd v-if="detail && !loading" class="mt-1 text-xs text-content-muted">{{ detail }}</dd>
    </dl>
  </div>
</template>
