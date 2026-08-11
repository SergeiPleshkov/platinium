<script setup lang="ts">
import DragHandle from '@/features/dashboard/components/DragHandle.vue'
import { BaseSkeleton } from '@/shared/ui'

/**
 * A single headline figure.
 *
 * Rendered as a definition list so the label and value are programmatically associated
 * a big number with a small word above it is only a statistic to someone who can see the
 * layout.
 *
 * When `sortable`, it grows a `DragHandle`, shared with the wider dashboard panels, so the
 * two cannot drift apart in how they reorder.
 */

interface Props {
  label: string
  /** A single headline figure. Ignored when `values` is supplied. */
  value?: string | undefined
  /**
   * Several figures that must not be combined, per-currency totals, most obviously.
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
</script>

<template>
  <!--
    `h-full` so a tile with one line of detail matches a taller neighbour in the same row.
    The grid stretches the surrounding `<li>`; without this the card keeps its content height
    and leaves a gap beneath itself.
  -->
  <div
    :class="[
      'flex h-full flex-col rounded-lg border bg-surface-0 p-4 transition-all dark:bg-surface-900',
      isDropTarget ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-border',
      isDragging ? 'opacity-40' : '',
    ]"
  >
    <dl>
      <dt class="flex items-center gap-2 text-sm text-content-muted">
        <i v-if="icon" :class="icon" aria-hidden="true" />
        {{ label }}
        <DragHandle
          v-if="sortable"
          class="ml-auto"
          :label="label"
          :position="position"
          :total="total"
          @move="emit('move', $event)"
        />
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
