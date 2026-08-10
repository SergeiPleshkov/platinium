<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useTicketsStore } from '@/features/tickets/store'
import { ApiError } from '@/shared/api'
import { useNotifications } from '@/shared/composables'
import type { ImportResult, ImportRowError } from '@/shared/types/import'
import { parseCsvTable } from '@/shared/utils/csv'
import { BaseButton, BaseModal, BaseSpinner } from '@/shared/ui'

/**
 * Import tickets from a CSV.
 *
 * Three states, in order: choose a file, read the report, commit. The middle one is the point
 * — nothing is written until the admin has seen what *would* be written, and the preview is
 * produced by the real endpoint in dry-run mode rather than by a second validator that could
 * disagree with it.
 *
 * The file is parsed in the browser only to turn text into rows. Every judgement about those
 * rows — does this event exist, is this a valid status — belongs to the server.
 */

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; imported: [] }>()

const store = useTicketsStore()
const notifications = useNotifications()

const fileName = ref<string | null>(null)
const rows = ref<Array<Record<string, string>>>([])
const preview = ref<ImportResult | null>(null)
const busy = ref(false)
const parseError = ref<string | null>(null)

const canCommit = computed(() => preview.value !== null && preview.value.accepted > 0)

// A dialog reopened after an import must not still be showing the last one's report.
watch(
  () => props.open,
  (open) => {
    if (!open) reset()
  },
)

function reset(): void {
  fileName.value = null
  rows.value = []
  preview.value = null
  parseError.value = null
  busy.value = false
}

async function onFileChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  reset()
  fileName.value = file.name

  const table = parseCsvTable(await file.text())
  if (table.rows.length === 0) {
    parseError.value = 'That file has no data rows.'
    return
  }

  /*
   * Keyed by header rather than sent positionally, so a file whose columns have been reordered
   * in a spreadsheet still imports. Position is the one thing about a CSV nobody preserves.
   */
  rows.value = table.rows.map((row) =>
    Object.fromEntries(table.headers.map((header, index) => [header, row[index] ?? ''])),
  )

  await runPreview()
}

async function runPreview(): Promise<void> {
  busy.value = true
  try {
    preview.value = await store.importRows({ rows: rows.value, dryRun: true })
  } catch (caught) {
    parseError.value =
      caught instanceof ApiError ? caught.message : 'Could not check the file. Try again.'
  } finally {
    busy.value = false
  }
}

/**
 * "Line 4 · Currency", or just "Line 4".
 *
 * Assembled here rather than from adjacent spans in the template: Vue condenses whitespace
 * between elements, which silently ate the spaces around the separator and rendered "Line 4·
 * Currency". One string has no gaps to lose.
 */
function locationOf(problem: ImportRowError): string {
  return problem.field ? `Line ${problem.line} · ${problem.field}` : `Line ${problem.line}`
}

async function commit(): Promise<void> {
  busy.value = true
  try {
    const result = await store.importRows({ rows: rows.value, dryRun: false })

    notifications.success(
      `${result.accepted} ticket${result.accepted === 1 ? '' : 's'} imported`,
      result.errors.length > 0 ? `${result.errors.length} rows were skipped.` : undefined,
    )
    emit('imported')
    emit('update:open', false)
  } catch (caught) {
    notifications.fromError(caught, 'Could not import the file. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal :open="open" title="Import tickets" @update:open="emit('update:open', $event)">
    <div class="space-y-4">
      <div>
        <label for="ticket-import-file" class="text-sm font-medium text-content">CSV file</label>
        <p class="mt-1 text-xs text-content-muted">
          Use the columns the export produces: Name, Event, Category, Price (minor units), Currency,
          Quantity, Status. Events and categories are matched by name.
        </p>
        <input
          id="ticket-import-file"
          type="file"
          accept=".csv,text/csv"
          class="mt-2 block w-full text-sm text-content file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          @change="onFileChosen"
        />
      </div>

      <p v-if="parseError" class="text-sm text-red-600 dark:text-red-400" role="alert">
        {{ parseError }}
      </p>

      <div v-if="busy" class="flex items-center gap-2 text-sm text-content-muted">
        <BaseSpinner size="sm" decorative />
        Checking the file…
      </div>

      <!-- The report. Rendered before anything is written, from the endpoint that will write it. -->
      <div v-if="preview && !busy" class="rounded-lg border border-border p-4">
        <p class="text-sm font-medium text-content">
          {{ preview.accepted }} of {{ preview.total }} rows are ready to import
        </p>

        <p v-if="preview.errors.length === 0" class="mt-1 text-sm text-content-muted">
          No problems found.
        </p>

        <template v-else>
          <p class="mt-1 text-sm text-content-muted">
            {{ preview.errors.length }} problem{{ preview.errors.length === 1 ? '' : 's' }} — these
            rows will be skipped.
          </p>

          <!--
            Line numbers, not row indices: the user is going to fix this in a spreadsheet, and
            the number they need is the one in the left-hand gutter.
          -->
          <ul class="mt-3 max-h-48 space-y-1 overflow-y-auto">
            <li
              v-for="(problem, index) in preview.errors"
              :key="`${problem.line}-${problem.field}-${index}`"
              class="text-sm text-content-muted"
            >
              <span class="font-medium text-content">{{ locationOf(problem) }}</span>
              — {{ problem.reason }}
            </li>
          </ul>
        </template>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="secondary" :disabled="busy" @click="emit('update:open', false)">
        Cancel
      </BaseButton>
      <BaseButton :disabled="!canCommit || busy" :loading="busy" @click="commit">
        Import {{ preview?.accepted ?? 0 }} tickets
      </BaseButton>
    </template>
  </BaseModal>
</template>
