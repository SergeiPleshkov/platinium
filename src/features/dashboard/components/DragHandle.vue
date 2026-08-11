<script setup lang="ts">
/**
 * The grip that reorders a dashboard widget.
 *
 * A real `<button>`, not a styled `<div>` with a grab cursor, because HTML5 drag and drop has
 * no keyboard equivalent whatsoever. Without a focusable control carrying arrow-key handling,
 * the arrangement feature would simply not exist for keyboard and switch users.
 *
 * Extracted so the figure tiles and the wider panels cannot drift apart: they sit in one
 * arrangement, and a widget that reorders differently depending on its shape is a bug the
 * user has to learn around.
 */

defineProps<{
  /** The widget's name, for the accessible label. */
  label: string
  position?: number | undefined
  total?: number | undefined
}>()

const emit = defineEmits<{ move: [delta: number] }>()

/**
 * Arrow keys nudge the widget one place.
 *
 * Both axes, because the grid reflows: four columns at `xl`, two at `sm`, one below that. The
 * "next" widget is to the right on a desktop and below on a phone, and the user should not
 * have to work out which.
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
  <button
    type="button"
    class="shrink-0 cursor-grab rounded p-1 text-content-muted hover:bg-surface-100 hover:text-content focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:cursor-grabbing dark:hover:bg-surface-800"
    :aria-label="`Reorder ${label}, currently ${position} of ${total}. Use the arrow keys to move it.`"
    @keydown="onKeydown"
  >
    <i class="pi pi-bars text-xs" aria-hidden="true" />
  </button>
</template>
