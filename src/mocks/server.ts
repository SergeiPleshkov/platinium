import { setupServer } from 'msw/node'

import { handlers } from '@/mocks/handlers'

/** The mock backend, running in Node for Vitest. Registered in `tests/setup.ts`. */
export const server = setupServer(...handlers)
