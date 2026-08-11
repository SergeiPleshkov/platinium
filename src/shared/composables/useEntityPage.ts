import { ref, type Ref } from 'vue'

import { ApiError } from '@/shared/api'

/**
 * Shared create / edit / delete chrome for entity list pages.
 *
 * Extracted after the third list page (categories, events, tickets) grew the same dialog
 * open/close state, delete-confirmation lifecycle, and refresh-then-adopt-page dance. Columns,
 * filters, bulk actions and import stay on the page — they are not shared.
 */

export interface EntityPageRecord {
  id: string
  name: string
}

export interface UseEntityPageOptions {
  /** Re-query the current list (usually `table.refresh`). */
  refresh: () => Promise<void>
  /** Follow the server's clamped page after a delete emptied the current one. */
  adoptPage: (page: number) => void
  /** Current `meta.page` from the store after refresh. */
  currentPage: () => number
  remove: (id: string) => Promise<void>
  /**
   * Singular capitalised label for toasts, e.g. `"Category"` → `"Category deleted"`.
   */
  entityLabel: string
  success: (title: string, detail: string) => void
  /** Extra work after a successful create/edit save (e.g. refresh event countries). */
  afterSave?: () => Promise<void>
  fallbackDeleteError?: string
}

export interface UseEntityPage<T extends EntityPageRecord> {
  formOpen: Ref<boolean>
  editing: Ref<T | null>
  openCreate: () => void
  openEdit: (record: T) => void
  onSaved: () => Promise<void>
  deleting: Ref<T | null>
  deletePending: Ref<boolean>
  deleteError: Ref<string | null>
  askDelete: (record: T) => void
  closeDelete: () => void
  confirmDelete: () => Promise<void>
}

export function useEntityPage<T extends EntityPageRecord>(
  options: UseEntityPageOptions,
): UseEntityPage<T> {
  const formOpen = ref(false)
  const editing = ref<T | null>(null) as Ref<T | null>

  const deleting = ref<T | null>(null) as Ref<T | null>
  const deletePending = ref(false)
  const deleteError = ref<string | null>(null)

  const fallbackDeleteError =
    options.fallbackDeleteError ??
    `Could not delete the ${options.entityLabel.toLowerCase()}. Try again.`

  function openCreate(): void {
    editing.value = null
    formOpen.value = true
  }

  function openEdit(record: T): void {
    editing.value = record
    formOpen.value = true
  }

  async function onSaved(): Promise<void> {
    // A new record may belong on another page under the current sort, so re-query.
    if (options.afterSave) await Promise.all([options.refresh(), options.afterSave()])
    else await options.refresh()
  }

  function askDelete(record: T): void {
    deleting.value = record
    deleteError.value = null
  }

  function closeDelete(): void {
    deleting.value = null
    deleteError.value = null
  }

  async function confirmDelete(): Promise<void> {
    const target = deleting.value
    if (!target) return

    deletePending.value = true
    deleteError.value = null

    try {
      await options.remove(target.id)
      options.success(`${options.entityLabel} deleted`, `“${target.name}” has been removed.`)
      deleting.value = null

      /*
       * Deleting the last row on a page leaves it empty; the server clamps to the last valid
       * page and `adoptPage` follows it, so the user never lands on a blank table.
       */
      await options.refresh()
      options.adoptPage(options.currentPage())
    } catch (caught) {
      // Kept in the dialog rather than a toast: the explanation belongs next to the action.
      deleteError.value = caught instanceof ApiError ? caught.message : fallbackDeleteError
    } finally {
      deletePending.value = false
    }
  }

  return {
    formOpen,
    editing,
    openCreate,
    openEdit,
    onSaved,
    deleting,
    deletePending,
    deleteError,
    askDelete,
    closeDelete,
    confirmDelete,
  }
}
