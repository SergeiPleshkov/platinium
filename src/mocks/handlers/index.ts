import type { RequestHandler } from 'msw'

import { authHandlers } from '@/mocks/handlers/auth'
import { categoryHandlers } from '@/mocks/handlers/categories'
import { eventHandlers } from '@/mocks/handlers/events'
import { statsHandlers } from '@/mocks/handlers/stats'
import { ticketHandlers } from '@/mocks/handlers/tickets'

/**
 * The complete mock backend.
 *
 * One handler set, two runtimes: `browser.ts` runs it in a Service Worker for the dev server,
 * `server.ts` runs it in Node for Vitest. Tests therefore exercise exactly the request
 * handling the application does — there is no second, divergent set of stubs to keep in sync.
 */
export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...categoryHandlers,
  ...eventHandlers,
  ...statsHandlers,
  ...ticketHandlers,
]

export { API_BASE } from '@/mocks/handlers/base'
