import { readonly, ref, type DeepReadonly, type Ref } from 'vue'

import { ApiError } from '@/shared/api'

/**
 * Wraps an async operation so its pending and error state are handled the same way every
 * time.
 *
 * The guarantee that matters: `pending` always unwinds, on both the success and the failure
 * path. Hand-written `try/finally` around every submit is where "the spinner never stops"
 * bugs come from — one early return, or one `await` outside the block, and the button is
 * disabled forever.
 */

export interface UseAsyncAction<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>
  pending: DeepReadonly<Ref<boolean>>
  error: DeepReadonly<Ref<ApiError | null>>
  /** Field-level messages from a 422, ready to project onto a form. Empty otherwise. */
  fieldErrors: DeepReadonly<Ref<Record<string, string>>>
  reset: () => void
}

export interface AsyncActionOptions<TResult> {
  onSuccess?: (result: TResult) => void
  /** Return `true` to mark the error handled and stop it being re-thrown. */
  onError?: (error: ApiError) => boolean | void
  /** Re-throw after handling, for callers that need to branch. Defaults to false. */
  rethrow?: boolean
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: AsyncActionOptions<TResult> = {},
): UseAsyncAction<TArgs, TResult> {
  const pending = ref(false)
  const error = ref<ApiError | null>(null)
  const fieldErrors = ref<Record<string, string>>({})

  /*
   * Guards against a stale slow call clobbering the state of a newer one: only the most
   * recent invocation is allowed to write results.
   */
  let invocation = 0

  function reset(): void {
    error.value = null
    fieldErrors.value = {}
  }

  async function run(...args: TArgs): Promise<TResult | undefined> {
    const current = ++invocation
    pending.value = true
    reset()

    try {
      const result = await action(...args)
      if (current !== invocation) return undefined

      options.onSuccess?.(result)
      return result
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError({
              kind: 'network',
              status: 0,
              message: 'Something went wrong. Try again.',
              cause: caught,
            })

      if (current === invocation) {
        // A superseded request is not a failure worth showing anyone.
        if (!apiError.isAborted) {
          error.value = apiError
          fieldErrors.value = apiError.fieldErrors
        }
        options.onError?.(apiError)
      }

      if (options.rethrow) throw apiError
      return undefined
    } finally {
      // Only the latest invocation clears the flag, so an overtaken call cannot unstick it.
      if (current === invocation) pending.value = false
    }
  }

  return {
    run,
    pending: readonly(pending),
    error: readonly(error),
    fieldErrors: readonly(fieldErrors),
    reset,
  }
}
