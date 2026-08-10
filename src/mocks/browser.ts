import { setupWorker } from 'msw/browser'

import { configureMocks } from '@/mocks/config'
import { handlers } from '@/mocks/handlers'

/** The mock backend, running in a Service Worker for the dev server and the Docker image. */
export const worker = setupWorker(...handlers)

export async function startMockApi(): Promise<void> {
  /*
   * Enough latency for loading states and skeletons to be real rather than a flicker, without
   * making the app feel broken. Tests leave this at 0.
   */
  configureMocks({ latencyMs: 220 })

  await worker.start({
    // Requests the mock backend does not implement (assets, fonts) pass through untouched.
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}
