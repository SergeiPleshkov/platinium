<script setup lang="ts">
import Dialog from 'primevue/dialog'

/**
 * A modal dialog.
 *
 * Full-screen below `sm`: a centred 32rem card on a 375px phone leaves no usable room for a
 * form. PrimeVue supplies the focus trap, `Esc` handling and focus restoration; the wrapper
 * fixes the parts that are easy to get wrong, a labelled heading, and a dialog that cannot
 * be dismissed out from under an in-flight save.
 */

interface Props {
  title: string
  description?: string | undefined
  /** Blocks the close button, `Esc` and backdrop dismissal, use while saving. */
  busy?: boolean | undefined
  width?: string | undefined
}

withDefaults(defineProps<Props>(), { busy: false, width: '32rem' })

defineSlots<{ default: () => unknown; footer?: () => unknown }>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <Dialog
    v-model:visible="open"
    :header="title"
    modal
    :draggable="false"
    :closable="!busy"
    :close-on-escape="!busy"
    :dismissable-mask="!busy"
    :breakpoints="{ '640px': '100vw' }"
    :style="{ width }"
    :pt="{ root: { 'aria-label': title } }"
  >
    <p v-if="description" class="-mt-2 mb-4 text-sm text-content-muted">{{ description }}</p>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>
