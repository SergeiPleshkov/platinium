import { readonly, ref, type DeepReadonly, type Ref } from 'vue'

import { ApiError } from '@/shared/api'

/**
 * The only way to raise a toast.
 *
 * Deliberately knows nothing about the UI kit: it owns a queue, and `BaseToaster` renders it.
 * That keeps notification *policy*, what gets announced, and in what words, testable
 * without mounting anything, and keeps features from reaching into PrimeVue's toast service.
 */

export type NotificationSeverity = 'success' | 'info' | 'warn' | 'error'

export interface Notification {
  id: number
  severity: NotificationSeverity
  summary: string
  detail?: string
  /** Milliseconds before auto-dismiss. Errors stay until dismissed. */
  life: number | null
}

const DEFAULT_LIFE: Record<NotificationSeverity, number | null> = {
  success: 4000,
  info: 5000,
  warn: 7000,
  // Errors are never auto-dismissed: the user may need to read, copy or act on them.
  error: null,
}

const queue = ref<Notification[]>([])
let sequence = 0

function push(
  severity: NotificationSeverity,
  summary: string,
  detail?: string,
  life?: number | null,
): number {
  sequence += 1
  queue.value.push({
    id: sequence,
    severity,
    summary,
    ...(detail === undefined ? {} : { detail }),
    life: life === undefined ? DEFAULT_LIFE[severity] : life,
  })
  return sequence
}

export interface UseNotifications {
  notifications: DeepReadonly<Ref<Notification[]>>
  success: (summary: string, detail?: string) => number
  info: (summary: string, detail?: string) => number
  warn: (summary: string, detail?: string) => number
  error: (summary: string, detail?: string) => number
  /** Turns an unknown thrown value into a toast, without ever showing a stack trace. */
  fromError: (error: unknown, fallback?: string) => number | null
  dismiss: (id: number) => void
  clear: () => void
}

export function useNotifications(): UseNotifications {
  return {
    notifications: readonly(queue),

    success: (summary, detail) => push('success', summary, detail),
    info: (summary, detail) => push('info', summary, detail),
    warn: (summary, detail) => push('warn', summary, detail),
    error: (summary, detail) => push('error', summary, detail),

    fromError(error, fallback = 'Something went wrong. Try again.') {
      /*
       * A superseded request is not a failure the user caused or can act on. Announcing it
       * would produce a toast every time someone types in a search box.
       */
      if (error instanceof ApiError && error.isAborted) return null

      /*
       * A 422 is already rendered against the individual fields that caused it; a toast
       * repeating "some details are not valid" adds noise and no information.
       */
      if (error instanceof ApiError && error.isValidation) return null

      const message = error instanceof ApiError ? error.message : fallback
      return push('error', message)
    },

    dismiss(id) {
      queue.value = queue.value.filter((notification) => notification.id !== id)
    },

    clear() {
      queue.value = []
    },
  }
}

/** Test-only: drops every queued notification and resets ids. */
export function resetNotifications(): void {
  queue.value = []
  sequence = 0
}
