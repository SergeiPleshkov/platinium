import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { ApiError } from '@/shared/api'
import { useNotifications } from '@/shared/composables/useNotifications'
import {
  isTotalFailure,
  type BulkFailure,
  type BulkRequest,
  type BulkResult,
} from '@/shared/types/bulk'

/**
 * Runs a bulk request and turns its per-record result into something a person can act on.
 *
 * **A partial success is not an error, and the naive handling gets it wrong both ways**
 * a try/catch hides the failures, treating it as a failure hides the successes. Hence one
 * place for the rule:
 *   - all worked → success toast, selection cleared
 *   - all failed → error toast, selection *kept*, so it can be amended without re-ticking
 *   - some worked → warning, plus the reasons on screen, because a toast is the wrong
 *     container for a list somebody has to read
 */

export interface UseBulkActionOptions {
  /** The store action. Rejects only on a transport or permission failure, never on refusals. */
  run: (payload: BulkRequest) => Promise<BulkResult>
  /** Re-queries the list. Several rows changed; patching them individually would be guesswork. */
  refresh: () => Promise<void>
  /** Clears the tick boxes. Called only when there is nothing left to retry. */
  clearSelection: () => void
  /** Resolves an id to something the admin recognises, for the failure list. */
  labelFor: (id: string) => string
  /** Plural noun, e.g. "tickets". */
  entityLabel: string
}

export interface FailureDetail extends BulkFailure {
  label: string
}

export interface UseBulkAction {
  busy: Ref<boolean>
  /** Non-empty while a partial failure is waiting to be acknowledged. */
  failures: Ref<FailureDetail[]>
  hasFailures: ComputedRef<boolean>
  dismissFailures: () => void
  execute: (payload: BulkRequest, verb: string) => Promise<void>
}

export function useBulkAction(options: UseBulkActionOptions): UseBulkAction {
  const notifications = useNotifications()

  const busy = ref(false)
  const failures = ref<FailureDetail[]>([])

  async function execute(payload: BulkRequest, verb: string): Promise<void> {
    busy.value = true
    failures.value = []

    try {
      const result = await options.run(payload)
      const total = payload.ids.length
      const done = result.succeeded.length

      /*
       * Refresh before reporting, so the numbers in the message describe a table the user is
       * already looking at rather than one that is about to change under them.
       */
      await options.refresh()

      if (result.failed.length === 0) {
        notifications.success(
          `${done} ${done === 1 ? singular(options.entityLabel) : options.entityLabel} ${verb}`,
        )
        options.clearSelection()
        return
      }

      failures.value = result.failed.map((failure) => ({
        ...failure,
        label: options.labelFor(failure.id),
      }))

      if (isTotalFailure(result)) {
        // Nothing changed, so the selection stays: the user can fix the cause and try again.
        notifications.error(
          `Could not ${verb.replace(/d$/, '')} any of the ${total} selected`,
          'See the reasons below.',
        )
        return
      }

      notifications.warn(
        `${done} of ${total} ${verb}`,
        `${result.failed.length} could not be. See the reasons below.`,
      )
      options.clearSelection()
    } catch (caught) {
      // A transport or permission failure: nothing was attempted, so nothing is reported.
      notifications.fromError(
        caught,
        caught instanceof ApiError
          ? caught.message
          : `Could not ${verb.replace(/d$/, '')} the selected ${options.entityLabel}.`,
      )
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    failures,
    hasFailures: computed(() => failures.value.length > 0),
    dismissFailures: () => {
      failures.value = []
    },
    execute,
  }
}

function singular(plural: string): string {
  return plural.replace(/s$/, '')
}
