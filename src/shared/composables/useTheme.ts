import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * Colour scheme.
 *
 * Three states, not two: `system` follows the operating system and is the default, because a
 * portal that ignores a user's OS-level dark preference is making a decision it was not asked
 * to make. An explicit choice overrides it and persists.
 *
 * The `.dark` class on `<html>` drives both Tailwind (via the `dark` custom variant) and
 * PrimeVue (via `darkModeSelector`), so one toggle moves both systems together.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'app.theme'

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const preference = ref<ThemePreference>(readStored())

function apply(): void {
  if (typeof document === 'undefined') return
  const dark = preference.value === 'dark' || (preference.value === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export interface UseTheme {
  preference: Ref<ThemePreference>
  isDark: ComputedRef<boolean>
  setPreference: (next: ThemePreference) => void
  /** Flips between light and dark, resolving `system` to its current appearance first. */
  toggle: () => void
}

export function useTheme(): UseTheme {
  const isDark = computed(
    () => preference.value === 'dark' || (preference.value === 'system' && prefersDark()),
  )

  function setPreference(next: ThemePreference): void {
    preference.value = next
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* Storage unavailable — the choice still applies for this page. */
    }
    apply()
  }

  return {
    preference,
    isDark,
    setPreference,
    toggle: () => setPreference(isDark.value ? 'light' : 'dark'),
  }
}

/** Applies the stored preference. Called once at bootstrap. */
export function initTheme(): void {
  preference.value = readStored()
  apply()
}

/** Test-only: returns the module to its default state. */
export function resetTheme(): void {
  preference.value = 'system'
  if (typeof document !== 'undefined') document.documentElement.classList.remove('dark')
}
