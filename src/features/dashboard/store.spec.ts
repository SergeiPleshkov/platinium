import { http as mswHttp, HttpResponse } from 'msw'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useDashboardStore } from '@/features/dashboard/store'
import { server } from '@/mocks/server'
import { configureHttp, resetHttpConfig } from '@/shared/api'
import { signIn } from '@tests/utils/apiClient'

const ORIGIN = window.location.origin

let store: ReturnType<typeof useDashboardStore>

beforeEach(async () => {
  setActivePinia(createPinia())
  const token = await signIn()
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => token })
  store = useDashboardStore()
})

afterEach(() => {
  resetHttpConfig()
})

describe('dashboard store', () => {
  it('fetchStats success sets stats and status to success', async () => {
    await store.fetchStats()

    expect(store.status).toBe('success')
    expect(store.stats).not.toBeNull()
    expect(store.stats!.events.total).toBeGreaterThan(0)
    expect(store.stats!.tickets.total).toBeGreaterThan(0)
  })

  it('fetchStats failure sets error via asApiError path', async () => {
    server.use(mswHttp.get(`${ORIGIN}/api/stats`, () => new HttpResponse(null, { status: 500 })))

    await store.fetchStats()

    expect(store.status).toBe('error')
    expect(store.hasError).toBe(true)
    expect(store.errorMessage).toBeTruthy()
  })

  it('abort does not set error', async () => {
    const controller = new AbortController()
    controller.abort()

    await store.fetchStats(controller.signal)

    expect(store.status).not.toBe('error')
    expect(store.hasError).toBe(false)
  })
})
