import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initTheme, resetTheme, useTheme } from '@/shared/composables/useTheme'
import { setPrefersDark } from '@tests/utils/viewport'

function isDarkApplied(): boolean {
  return document.documentElement.classList.contains('dark')
}

beforeEach(() => {
  localStorage.clear()
  resetTheme()
})

afterEach(() => {
  localStorage.clear()
  resetTheme()
})

describe('useTheme', () => {
  it('defaults to following the system', () => {
    const theme = useTheme()
    expect(theme.preference.value).toBe('system')
  })

  it('follows a system preference for dark', () => {
    setPrefersDark(true)
    initTheme()

    expect(isDarkApplied()).toBe(true)
    expect(useTheme().isDark.value).toBe(true)
  })

  it('follows a system preference for light', () => {
    setPrefersDark(false)
    initTheme()

    expect(isDarkApplied()).toBe(false)
  })

  it('lets an explicit choice override the system', () => {
    setPrefersDark(true)
    const theme = useTheme()

    theme.setPreference('light')

    // The OS says dark; the user said light. The user wins.
    expect(isDarkApplied()).toBe(false)
    expect(theme.isDark.value).toBe(false)
  })

  it('persists an explicit choice', () => {
    useTheme().setPreference('dark')
    expect(localStorage.getItem('app.theme')).toBe('dark')
  })

  it('restores a persisted choice', () => {
    localStorage.setItem('app.theme', 'dark')
    setPrefersDark(false)

    initTheme()

    expect(isDarkApplied()).toBe(true)
  })

  it('clears the stored value when returning to system', () => {
    const theme = useTheme()
    theme.setPreference('dark')
    theme.setPreference('system')

    // Absent, not the string "system": a later OS change should be followed.
    expect(localStorage.getItem('app.theme')).toBeNull()
  })

  it('toggles from the currently resolved appearance', () => {
    setPrefersDark(true)
    const theme = useTheme()
    // Preference is `system`, resolving to dark — toggling must go to light, not to dark.
    theme.toggle()

    expect(theme.preference.value).toBe('light')
    expect(isDarkApplied()).toBe(false)
  })

  it('survives storage being unavailable', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    try {
      expect(() => useTheme().setPreference('dark')).not.toThrow()
      // The choice still applies to this page even though it could not be saved.
      expect(isDarkApplied()).toBe(true)
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
