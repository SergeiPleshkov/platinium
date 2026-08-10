<script setup lang="ts">
import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseModal from '@/shared/ui/BaseModal/BaseModal.vue'

/**
 * Confirmation before a destructive action.
 *
 * Every delete in this application goes through one of these. The message names the record
 * being destroyed rather than saying "are you sure?", because a generic prompt trains people
 * to click through it — and the confirm button says what will happen, not "OK".
 */

interface Props {
  title: string
  message: string
  confirmLabel?: string | undefined
  cancelLabel?: string | undefined
  /** Disables both buttons and blocks dismissal while the action runs. */
  busy?: boolean | undefined
  /** Shown when the action failed, so the dialog can explain rather than just closing. */
  errorMessage?: string | undefined
}

withDefaults(defineProps<Props>(), {
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  busy: false,
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const open = defineModel<boolean>('open', { required: true })

function cancel(): void {
  open.value = false
  emit('cancel')
}
</script>

<template>
  <BaseModal v-model:open="open" :title="title" :busy="busy" width="28rem">
    <p class="text-sm text-content">{{ message }}</p>

    <p
      v-if="errorMessage"
      role="alert"
      class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {{ errorMessage }}
    </p>

    <template #footer>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" :disabled="busy" @click="cancel">
          {{ cancelLabel }}
        </BaseButton>
        <BaseButton variant="danger" :loading="busy" @click="emit('confirm')">
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
