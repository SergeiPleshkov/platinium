import { createRouter, createWebHistory, type Router } from 'vue-router'

import { routes } from '@/app/router/routes'

export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior(_to, _from, savedPosition) {
      return savedPosition ?? { top: 0 }
    },
  })

  router.afterEach((to) => {
    const title = typeof to.meta['title'] === 'string' ? to.meta['title'] : null
    document.title = title ? `${title} · Ticket Admin` : 'Ticket Admin'
  })

  return router
}

/**
 * The application-wide instance. Tests build their own via `createAppRouter()` so they never
 * share history state between cases.
 */
export const router = createAppRouter()

export { RouteName, routes } from '@/app/router/routes'
