import { createRouter, createWebHistory, type Router } from 'vue-router'

import { registerGuards } from '@/app/router/guards'
import { routes } from '@/app/router/routes'

export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior(_to, _from, savedPosition) {
      return savedPosition ?? { top: 0 }
    },
  })

  registerGuards(router)

  return router
}

/**
 * The application-wide instance. Tests build their own so they never share history or guard
 * state between cases.
 */
export const router = createAppRouter()

export { NAVIGATION, RouteName, routes } from '@/app/router/routes'
