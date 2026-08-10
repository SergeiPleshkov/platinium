import type { Router } from 'vue-router'

import { useAuthStore } from '@/features/auth'
import { RouteName } from '@/app/router/routes'

/**
 * Navigation guards.
 *
 * Registered on the router instance rather than declared inline in `routes.ts`, so tests can
 * build a router with or without them, and so the redirect policy is readable in one place.
 */
export function registerGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    /*
     * A token restored from storage is a claim, not proof. Validating it once, here, means
     * every downstream view can trust `isAuthenticated` instead of each handling its own 401.
     */
    if (auth.token !== null && auth.user === null) {
      await auth.restore()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      /*
       * The intended destination is preserved so signing in returns the user where they were
       * going — not to a generic landing page that makes them navigate again.
       */
      return {
        name: RouteName.Login,
        query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
      }
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { name: RouteName.Dashboard }
    }

    return true
  })

  router.afterEach((to) => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : null
    document.title = title ? `${title} · Ticket Admin` : 'Ticket Admin'
  })
}
