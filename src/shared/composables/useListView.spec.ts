import { createApp, defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useListView } from '@/shared/composables/useListView'
import { resetTableViewMode } from '@/shared/composables/useTableViewMode'
import type { ListQuery } from '@/shared/types/api'

afterEach(() => {
  resetTableViewMode()
  vi.restoreAllMocks()
})

type FetchList = (query: ListQuery, signal: AbortSignal) => Promise<void>
type FetchWindow = (query: ListQuery, signal: AbortSignal) => Promise<void>

async function mountListView(options: {
  fetchList: Mock<FetchList>
  fetchWindow: Mock<FetchWindow>
  resetBuffer: Mock<() => void>
}): Promise<{
  view: ReturnType<typeof useListView>
  unmount: () => void
}> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()

  let view: ReturnType<typeof useListView> | undefined

  const Wrapper = defineComponent({
    setup() {
      view = useListView({
        fetchList: options.fetchList,
        fetchWindow: options.fetchWindow,
        resetBuffer: options.resetBuffer,
        defaultSort: 'name',
      })
      return () => h('div')
    },
  })

  const app = createApp(Wrapper)
  app.use(router)
  const root = document.createElement('div')
  app.mount(root)

  return {
    view: view!,
    unmount: () => app.unmount(),
  }
}

describe('useListView', () => {
  it('loads the first page through fetchList in paginated mode', async () => {
    const fetchList = vi.fn<FetchList>().mockResolvedValue(undefined)
    const fetchWindow = vi.fn<FetchWindow>().mockResolvedValue(undefined)
    const resetBuffer = vi.fn<() => void>()

    const { unmount } = await mountListView({ fetchList, fetchWindow, resetBuffer })

    expect(fetchList).toHaveBeenCalled()
    expect(fetchWindow).not.toHaveBeenCalled()

    unmount()
  })

  it('switches to virtual mode by resetting the buffer and seeding a window', async () => {
    const fetchList = vi.fn<FetchList>().mockResolvedValue(undefined)
    const fetchWindow = vi.fn<FetchWindow>().mockResolvedValue(undefined)
    const resetBuffer = vi.fn<() => void>()

    const { view, unmount } = await mountListView({ fetchList, fetchWindow, resetBuffer })

    fetchList.mockClear()
    fetchWindow.mockClear()
    resetBuffer.mockClear()

    view.viewMode.setMode('virtual')
    await vi.waitFor(() => {
      expect(resetBuffer).toHaveBeenCalled()
      expect(fetchWindow).toHaveBeenCalled()
    })
    expect(view.viewMode.isVirtual.value).toBe(true)

    unmount()
  })

  it('forwards range changes to the virtual loader', async () => {
    const fetchList = vi.fn<FetchList>().mockResolvedValue(undefined)
    const fetchWindow = vi.fn<FetchWindow>().mockResolvedValue(undefined)
    const resetBuffer = vi.fn<() => void>()

    const { view, unmount } = await mountListView({ fetchList, fetchWindow, resetBuffer })

    view.viewMode.setMode('virtual')
    await vi.waitFor(() => expect(fetchWindow).toHaveBeenCalled())
    fetchWindow.mockClear()

    view.onRangeChange(10, 19)
    await vi.waitFor(() => expect(fetchWindow).toHaveBeenCalled())

    unmount()
  })
})
