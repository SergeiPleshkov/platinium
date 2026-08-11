import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { DashboardStats } from '@/features/dashboard/types'
import { asApiError, http, isAbortError, type ApiError } from '@/shared/api'
import type { AsyncStatus } from '@/shared/types/api'

/** Dashboard statistics, fetched whole from the server. */
export const useDashboardStore = defineStore('dashboard', () => {
  const stats = ref<DashboardStats | null>(null)
  const status = ref<AsyncStatus>('idle')
  const error = ref<ApiError | null>(null)

  const isLoading = computed(() => status.value === 'loading')
  const hasError = computed(() => status.value === 'error')
  const errorMessage = computed(() => error.value?.message)

  async function fetchStats(signal?: AbortSignal): Promise<void> {
    status.value = 'loading'
    error.value = null

    try {
      stats.value = await http.get<DashboardStats>('/stats', signal ? { signal } : {})
      status.value = 'success'
    } catch (caught) {
      if (isAbortError(caught)) return
      error.value = asApiError(caught, 'Could not load the dashboard. Try again.')
      status.value = 'error'
    }
  }

  return { stats, status, isLoading, hasError, errorMessage, fetchStats }
})
