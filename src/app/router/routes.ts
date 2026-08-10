import type { RouteRecordRaw } from 'vue-router'

/**
 * Route names are referenced by tests and guards, so they live here as a const map rather
 * than as string literals scattered through the app — a rename is then a type error, not a
 * silent 404.
 */
export const RouteName = {
  Startup: 'startup',
  NotFound: 'not-found',
} as const

export type RouteNameValue = (typeof RouteName)[keyof typeof RouteName]

/**
 * Every route component is lazy-loaded so each view lands in its own chunk and the initial
 * bundle stays small as the portal grows.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: RouteName.Startup,
    component: () => import('@/app/views/StartupView.vue'),
    meta: { title: 'Ticket Admin Portal' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: RouteName.NotFound,
    component: () => import('@/app/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]
