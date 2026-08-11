import { http as mswHttp, HttpResponse } from 'msw'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/features/auth/store'
import { SEED_PASSWORD, SEED_USERS } from '@/mocks/fixtures'
import { server } from '@/mocks/server'
import { configureHttp, resetHttpConfig } from '@/shared/api'

const ORIGIN = window.location.origin
const ADMIN = SEED_USERS[0]!

let store: ReturnType<typeof useAuthStore>

beforeEach(() => {
  setActivePinia(createPinia())
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => store.token })
  store = useAuthStore()
})

afterEach(() => {
  resetHttpConfig()
  localStorage.clear()
})

describe('auth store', () => {
  it('login success sets session', async () => {
    const ok = await store.login({ email: ADMIN.email, password: SEED_PASSWORD })

    expect(ok).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe(ADMIN.email)
    expect(store.token).toBeTruthy()
    expect(store.loginError).toBeNull()
  })

  it('login failure sets loginError', async () => {
    const ok = await store.login({ email: ADMIN.email, password: 'wrong-password' })

    expect(ok).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.loginError).toBeTruthy()
  })

  it('login failure with server error produces a fallback message', async () => {
    server.use(
      mswHttp.post(`${ORIGIN}/api/auth/login`, () => new HttpResponse(null, { status: 500 })),
    )

    const ok = await store.login({ email: ADMIN.email, password: SEED_PASSWORD })

    expect(ok).toBe(false)
    expect(store.loginError).toBeTruthy()
  })

  it('logout clears session', async () => {
    await store.login({ email: ADMIN.email, password: SEED_PASSWORD })
    expect(store.isAuthenticated).toBe(true)

    await store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
  })
})
