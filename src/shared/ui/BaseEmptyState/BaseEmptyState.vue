<script setup lang="ts">
/**
 * The "nothing here" panel.
 *
 * Deliberately takes an action slot: an empty list with no way forward is a dead end. The
 * two cases it serves read very differently — "no events yet, create one" versus "no events
 * match these filters, clear them" — so the caller supplies both the copy and the action.
 */

interface Props {
  title: string
  description?: string | undefined
  /** A PrimeIcons class. */
  icon?: string | undefined
}

withDefaults(defineProps<Props>(), { icon: 'pi pi-inbox' })

defineSlots<{ action?: () => unknown }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <i :class="[icon, 'text-3xl text-content-muted']" aria-hidden="true" />
    <div>
      <p class="font-medium text-content">{{ title }}</p>
      <p v-if="description" class="mt-1 max-w-sm text-sm text-content-muted">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.action" class="mt-1">
      <slot name="action" />
    </div>
  </div>
</template>
