import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi } from '@/features/auth/api'
import type { LoginPayload, User, UserRole } from '@/features/auth/types'
import { ApiError } from '@/shared/api'

const TOKEN_STORAGE_KEY = 'app.auth.token'

/**
 * Reading and writing storage is wrapped because it throws in Safari private mode and when a
 * browser policy blocks it. A failure to persist should downgrade to a session that does not
 * survive reload, never crash the app on boot.
 */
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_STORAGE_KEY)
    else localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    /* Storage unavailable — the in-memory session still works for this tab. */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(readStoredToken())
  const user = ref<User | null>(null)
  /** True until a restored token has been checked, so guards can wait instead of guessing. */
  const isRestoring = ref(false)
  const loginError = ref<string | null>(null)

  const isAuthenticated = computed(() => token.value !== null && user.value !== null)
  const role = computed<UserRole | null>(() => user.value?.role ?? null)
  const displayName = computed(() => user.value?.name ?? '')
  const initials = computed(() =>
    (user.value?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  )

  function setSession(nextToken: string, nextUser: User): void {
    token.value = nextToken
    user.value = nextUser
    writeStoredToken(nextToken)
  }

  function clearSession(): void {
    token.value = null
    user.value = null
    writeStoredToken(null)
  }

  async function login(payload: LoginPayload): Promise<boolean> {
    loginError.value = null

    try {
      const session = await authApi.login(payload)
      setSession(session.token, session.user)
      return true
    } catch (error) {
      /*
       * Rejected credentials are shown on the form, not as a toast — the user is looking at
       * the form, and a toast would disappear before a slow reader finished it.
       */
      loginError.value =
        error instanceof ApiError ? error.message : 'Could not sign you in. Try again in a moment.'
      return false
    }
  }

  /**
   * Validates a token restored from storage.
   *
   * A persisted token is a claim, not proof: it may have been revoked, or the mock backend
   * may have restarted. Trusting it would render the portal and then fail every request with
   * a 401. Checking once on boot is cheaper than handling that everywhere.
   */
  async function restore(): Promise<boolean> {
    if (token.value === null) return false
    if (user.value !== null) return true

    isRestoring.value = true
    try {
      user.value = await authApi.me()
      return true
    } catch {
      clearSession()
      return false
    } finally {
      isRestoring.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      /* Best effort. Whether or not the server acknowledged, this session is over locally. */
    } finally {
      clearSession()
    }
  }

  /** Called by the HTTP layer's 401 hook. Local-only: the token is already invalid. */
  function endExpiredSession(): void {
    clearSession()
  }

  return {
    token,
    user,
    isRestoring,
    loginError,
    isAuthenticated,
    role,
    displayName,
    initials,
    login,
    logout,
    restore,
    endExpiredSession,
  }
})
