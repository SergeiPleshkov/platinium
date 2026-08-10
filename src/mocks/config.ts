/**
 * Runtime knobs for the mock backend.
 *
 * Two things the client must be able to exercise, and neither is possible against a mock
 * that always succeeds instantly: **loading states** need latency, and **error handling**
 * needs failures. Both are controllable here rather than hard-coded, so the browser can feel
 * realistic while tests stay fast.
 */

export interface MockConfig {
  /** Artificial delay per request, in milliseconds. */
  latencyMs: number
  /**
   * When set, every request fails with this status. Used by the dev-time error toggle and by
   * tests that assert the error path. Per-request overrides via the `x-mock-fail` header take
   * precedence over this.
   */
  forcedStatus: number | null
}

const config: MockConfig = {
  latencyMs: 0,
  forcedStatus: null,
}

export function configureMocks(overrides: Partial<MockConfig>): void {
  Object.assign(config, overrides)
}

export function getMockConfig(): Readonly<MockConfig> {
  return config
}

export function resetMockConfig(): void {
  config.latencyMs = 0
  config.forcedStatus = null
}

export function delay(): Promise<void> {
  if (config.latencyMs <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, config.latencyMs))
}

/**
 * Lets a single request opt into failing, via `x-mock-fail: 500`.
 *
 * This is what makes "show me the error state" a one-line change in a test rather than a
 * handler override, and it lets the running app demonstrate graceful failure on demand.
 */
export function forcedFailureStatus(request: Request): number | null {
  const header = request.headers.get('x-mock-fail')
  if (header !== null) {
    const status = Number.parseInt(header, 10)
    if (Number.isFinite(status) && status >= 400 && status <= 599) return status
  }
  return config.forcedStatus
}
