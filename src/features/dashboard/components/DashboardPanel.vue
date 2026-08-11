<script setup lang="ts">
import DragHandle from '@/features/dashboard/components/DragHandle.vue'

/**
 * A wider dashboard widget: a heading and a list, rather than a single figure.
 *
 * Shares the drag contract with `StatTile` — same handle, same `move` event, same position
 * announcement — because the two sit in one arrangement and a widget that dragged differently
 * depending on its shape would be a bug the user has to learn.
 */

defineProps<{
  label: string
  detail?: string | undefined
  isDragging?: boolean | undefined
  isDropTarget?: boolean | undefined
  position?: number | undefined
  total?: number | undefined
}>()

const emit = defineEmits<{ move: [delta: number] }>()
</script>

<template>
  <!--
    `h-full` so a short panel matches a tall one in the same row. The grid stretches the
    surrounding `<li>`; without this the card keeps its content height and leaves a gap.
  -->
  <section
    :class="[
      'flex h-full flex-col rounded-lg border bg-surface-0 p-4 transition-all dark:bg-surface-900',
      isDropTarget ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-border',
      isDragging ? 'opacity-40' : '',
    ]"
  >
    <div class="flex items-start gap-2">
      <div class="min-w-0">
        <h2 class="font-medium text-content">{{ label }}</h2>
        <p v-if="detail" class="mt-0.5 text-xs text-content-muted">{{ detail }}</p>
      </div>
      <DragHandle
        class="ml-auto"
        :label="label"
        :position="position"
        :total="total"
        @move="emit('move', $event)"
      />
    </div>

    <slot />
  </section>
</template>
