<script setup lang="ts">
import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseSelect, { type SelectOption } from '@/shared/ui/BaseSelect/BaseSelect.vue'
import { ref, watch } from 'vue'

/**
 * The bar that appears once rows are ticked.
 *
 * Occupies layout rather than floating over the table. A floating bar covers the last row —
 * which, when the action is "delete these", is exactly the row the user is trying to check
 * before committing.
 *
 * Knows nothing about entities. It is handed a count, a set of status options and two
 * permissions, and emits intent.
 */

const props = defineProps<{
  count: number
  /**
   * Omit to hide the status control entirely — for entities that have no status.
   *
   * Typed as `SelectOption<string>` rather than a generic: the bulk contract transports the
   * status as a string, so a generic here would only add inference friction on the way to
   * being widened again one line later.
   */
  statusOptions?: ReadonlyArray<SelectOption<string>> | undefined
  canUpdate?: boolean | undefined
  canDelete?: boolean | undefined
  busy?: boolean | undefined
  /** Plural noun for the count, e.g. "tickets". */
  entityLabel: string
}>()

const emit = defineEmits<{
  applyStatus: [status: string]
  deleteSelected: []
  clear: []
}>()

const pendingStatus = ref<string | null>(null)

// A status left over from the last batch must not be applied to the next one by accident.
watch(
  () => props.count,
  (count) => {
    if (count === 0) pendingStatus.value = null
  },
)

function applyStatus(): void {
  if (pendingStatus.value !== null) emit('applyStatus', pendingStatus.value)
}
</script>

<template>
  <div
    v-if="count > 0"
    class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 dark:border-surface-700 dark:bg-surface-800"
    role="region"
    aria-label="Bulk actions"
  >
    <!--
      `aria-live` because this region appears in response to a checkbox several rows away —
      a sighted user sees it arrive, and without this nobody else would know it had.
    -->
    <p class="text-sm font-medium text-content" aria-live="polite">
      {{ count }} {{ count === 1 ? entityLabel.replace(/s$/, '') : entityLabel }} selected
    </p>

    <div class="ml-auto flex flex-wrap items-center gap-2">
      <template v-if="statusOptions && canUpdate">
        <div class="w-44">
          <BaseSelect
            v-model="pendingStatus"
            label="Set status for selected"
            label-hidden
            placeholder="Set status…"
            :options="statusOptions"
            :disabled="busy"
          />
        </div>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="pendingStatus === null || busy"
          @click="applyStatus"
        >
          Apply
        </BaseButton>
      </template>

      <BaseButton
        v-if="canDelete"
        variant="danger"
        size="sm"
        icon="pi pi-trash"
        label="Delete selected"
        :loading="busy"
        @click="emit('deleteSelected')"
      />

      <BaseButton variant="ghost" size="sm" :disabled="busy" @click="emit('clear')">
        Clear
      </BaseButton>
    </div>
  </div>
</template>
