import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api'
import { useAsyncAction } from '@/shared/composables/useAsyncAction'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsyncAction', () => {
  it('reports pending across the call and clears it on success', async () => {
    const gate = deferred<string>()
    const action = useAsyncAction(() => gate.promise)

    const pending = action.run()
    expect(action.pending.value).toBe(true)

    gate.resolve('done')
    await expect(pending).resolves.toBe('done')
    expect(action.pending.value).toBe(false)
    expect(action.error.value).toBeNull()
  })

  it('clears pending on failure too, the spinner must always stop', async () => {
    const action = useAsyncAction(() =>
      Promise.reject(new ApiError({ kind: 'http', status: 500, message: 'Server error' })),
    )

    await action.run()

    expect(action.pending.value).toBe(false)
    expect(action.error.value?.message).toBe('Server error')
  })

  it('exposes field errors from a 422 so a form can project them', async () => {
    const action = useAsyncAction(() =>
      Promise.reject(
        new ApiError({
          kind: 'http',
          status: 422,
          message: 'Some of the details are not valid.',
          fieldErrors: { name: 'Enter a name' },
        }),
      ),
    )

    await action.run()

    expect(action.fieldErrors.value).toEqual({ name: 'Enter a name' })
  })

  it('wraps a non-ApiError rejection rather than leaking it', async () => {
    const action = useAsyncAction(() => Promise.reject(new TypeError('boom')))

    await action.run()

    expect(action.error.value).toBeInstanceOf(ApiError)
    expect(action.error.value?.message).toBe('Something went wrong. Try again.')
  })

  it('does not record an aborted request as an error', async () => {
    const action = useAsyncAction(() =>
      Promise.reject(new ApiError({ kind: 'aborted', status: 0, message: 'Cancelled' })),
    )

    await action.run()

    expect(action.error.value).toBeNull()
  })

  it('calls onSuccess with the result', async () => {
    const onSuccess = vi.fn()
    const action = useAsyncAction(() => Promise.resolve(42), { onSuccess })

    await action.run()

    expect(onSuccess).toHaveBeenCalledWith(42)
  })

  it('re-throws only when asked', async () => {
    const failing = (): Promise<never> =>
      Promise.reject(new ApiError({ kind: 'http', status: 500, message: 'Server error' }))

    await expect(useAsyncAction(failing).run()).resolves.toBeUndefined()
    await expect(useAsyncAction(failing, { rethrow: true }).run()).rejects.toBeInstanceOf(ApiError)
  })

  it('ignores a slow earlier call that resolves after a newer one', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const calls = [first, second]
    let index = 0

    const onSuccess = vi.fn()
    const action = useAsyncAction(() => calls[index++]!.promise, { onSuccess })

    const firstRun = action.run()
    const secondRun = action.run()

    second.resolve('newer')
    await secondRun
    first.resolve('older')
    await firstRun

    // The superseded call must not deliver its result or unstick the newer one's state.
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('newer')
    expect(action.pending.value).toBe(false)
  })

  it('clears a previous error when re-run', async () => {
    let shouldFail = true
    const action = useAsyncAction(() =>
      shouldFail
        ? Promise.reject(new ApiError({ kind: 'http', status: 500, message: 'Server error' }))
        : Promise.resolve('ok'),
    )

    await action.run()
    expect(action.error.value).not.toBeNull()

    shouldFail = false
    await action.run()
    expect(action.error.value).toBeNull()
    expect(action.fieldErrors.value).toEqual({})
  })
})
