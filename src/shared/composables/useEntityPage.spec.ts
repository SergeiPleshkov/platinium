import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api'
import { useEntityPage, type UseEntityPageOptions } from '@/shared/composables/useEntityPage'

interface Row {
  id: string
  name: string
}

function createPage(overrides: Partial<UseEntityPageOptions> = {}) {
  const refresh = vi.fn((): Promise<void> => Promise.resolve())
  const adoptPage = vi.fn()
  const remove = vi.fn((): Promise<void> => Promise.resolve())
  const success = vi.fn()
  const currentPage = vi.fn(() => 2)

  const page = useEntityPage<Row>({
    refresh,
    adoptPage,
    currentPage,
    remove,
    entityLabel: 'Category',
    success,
    ...overrides,
  })

  return { page, refresh, adoptPage, remove, success, currentPage }
}

describe('useEntityPage', () => {
  it('opens create with no editing record', () => {
    const { page } = createPage()

    page.openCreate()

    expect(page.formOpen.value).toBe(true)
    expect(page.editing.value).toBeNull()
  })

  it('opens edit with the given record', () => {
    const { page } = createPage()
    const row = { id: '1', name: 'VIP' }

    page.openEdit(row)

    expect(page.formOpen.value).toBe(true)
    expect(page.editing.value).toEqual(row)
  })

  it('refreshes after save and runs afterSave when provided', async () => {
    const afterSave = vi.fn((): Promise<void> => Promise.resolve())
    const { page, refresh } = createPage({ afterSave })

    await page.onSaved()

    expect(refresh).toHaveBeenCalledOnce()
    expect(afterSave).toHaveBeenCalledOnce()
  })

  it('deletes, toasts, closes the dialog, then refreshes and adopts the page', async () => {
    const { page, refresh, adoptPage, remove, success, currentPage } = createPage()
    const row = { id: '1', name: 'VIP' }

    page.askDelete(row)
    await page.confirmDelete()

    expect(remove).toHaveBeenCalledWith('1')
    expect(success).toHaveBeenCalledWith('Category deleted', '“VIP” has been removed.')
    expect(page.deleting.value).toBeNull()
    expect(refresh).toHaveBeenCalledOnce()
    expect(currentPage).toHaveBeenCalledOnce()
    expect(adoptPage).toHaveBeenCalledWith(2)
    expect(page.deletePending.value).toBe(false)
  })

  it('keeps the dialog open with the server message on failure', async () => {
    const remove = vi.fn((): Promise<void> =>
      Promise.reject(
        new ApiError({
          kind: 'http',
          status: 409,
          message: 'Still has tickets.',
        }),
      ),
    )
    const { page, refresh, success } = createPage({ remove })
    const row = { id: '1', name: 'VIP' }

    page.askDelete(row)
    await page.confirmDelete()

    expect(page.deleting.value).toEqual(row)
    expect(page.deleteError.value).toBe('Still has tickets.')
    expect(success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(page.deletePending.value).toBe(false)
  })

  it('closeDelete clears the target and any error', () => {
    const { page } = createPage()

    page.askDelete({ id: '1', name: 'VIP' })
    page.deleteError.value = 'Nope'
    page.closeDelete()

    expect(page.deleting.value).toBeNull()
    expect(page.deleteError.value).toBeNull()
  })
})
