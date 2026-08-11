import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useRelationOptionsLoader,
  type RelationOptionsFetchArgs,
} from '@/shared/composables/useRelationOptionsLoader'
import type { EntityRef } from '@/shared/types/entity'

afterEach(() => {
  vi.restoreAllMocks()
})

function withLoader(setup: () => ReturnType<typeof useRelationOptionsLoader>): {
  load: (search?: string) => void
  unmount: () => void
} {
  let api: ReturnType<typeof useRelationOptionsLoader> | undefined

  const Wrapper = defineComponent({
    setup() {
      api = setup()
      return () => h('div')
    },
  })

  const app = createApp(Wrapper)
  const root = document.createElement('div')
  app.mount(root)

  return {
    load: (search?: string) => api!.load(search),
    unmount: () => app.unmount(),
  }
}

describe('useRelationOptionsLoader', () => {
  it('passes search, pin and signal to fetchOptions', () => {
    const fetchOptions = vi.fn().mockResolvedValue(undefined)
    const selectedId = ref('evt_1')
    const current = ref<EntityRef[]>([{ id: 'evt_1', name: 'Gala' }])

    const { load, unmount } = withLoader(() =>
      useRelationOptionsLoader({
        fetchOptions,
        selectedId,
        currentOptions: current,
      }),
    )

    load('sum')

    expect(fetchOptions).toHaveBeenCalledTimes(1)
    const args = fetchOptions.mock.calls[0]![0] as RelationOptionsFetchArgs
    expect(args.search).toBe('sum')
    expect(args.pin).toEqual({ id: 'evt_1', name: 'Gala' })
    expect(args.signal).toBeInstanceOf(AbortSignal)

    unmount()
  })

  it('prefers the fallback pin when it matches the selected id', () => {
    const fetchOptions = vi.fn().mockResolvedValue(undefined)
    const fallback: EntityRef = { id: 'evt_9', name: 'From record' }

    const { load, unmount } = withLoader(() =>
      useRelationOptionsLoader({
        fetchOptions,
        selectedId: 'evt_9',
        fallback,
        currentOptions: [],
      }),
    )

    load()

    expect(fetchOptions.mock.calls[0]![0].pin).toEqual(fallback)
    unmount()
  })

  it('aborts the previous request when load is called again', () => {
    const fetchOptions = vi.fn().mockResolvedValue(undefined)

    const { load, unmount } = withLoader(() =>
      useRelationOptionsLoader({
        fetchOptions,
        selectedId: null,
        currentOptions: [],
      }),
    )

    load('a')
    const firstSignal = (fetchOptions.mock.calls[0]![0] as RelationOptionsFetchArgs).signal!
    expect(firstSignal.aborted).toBe(false)

    load('b')
    expect(firstSignal.aborted).toBe(true)
    expect(fetchOptions).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('aborts the in-flight request when the scope is disposed', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(undefined)

    const { load, unmount } = withLoader(() =>
      useRelationOptionsLoader({
        fetchOptions,
        selectedId: null,
        currentOptions: [],
      }),
    )

    load()
    const signal = (fetchOptions.mock.calls[0]![0] as RelationOptionsFetchArgs).signal!
    unmount()
    await nextTick()

    expect(signal.aborted).toBe(true)
  })
})
