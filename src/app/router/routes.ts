import type { RouteRecordRaw } from 'vue-router'

/**
 * Route names are referenced by tests, guards and navigation, so they live here as a const
 * map rather than as string literals scattered through the app — a rename is then a type
 * error, not a silent 404.
 */
export const RouteName = {
  Login: 'login',
  Dashboard: 'dashboard',
  Events: 'events',
  Categories: 'categories',
  Tickets: 'tickets',
  NotFound: 'not-found',
} as const

export type RouteNameValue = (typeof RouteName)[keyof typeof RouteName]

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Requires a signed-in user. Enforced by the guard in `router/guards.ts`. */
    requiresAuth?: boolean
    /** Only reachable while signed out — the login page redirects away once authenticated. */
    guestOnly?: boolean
  }
}

/**
 * Every route component is lazy-loaded so each view lands in its own chunk and the initial
 * bundle stays small as the portal grows.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: RouteName.Login,
    component: () => import('@/features/auth/pages/LoginPage.vue'),
    meta: { title: 'Sign in', guestOnly: true },
  },
  {
    path: '/',
    component: () => import('@/app/layouts/PortalLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: RouteName.Dashboard } },
      {
        path: 'dashboard',
        name: RouteName.Dashboard,
        component: () => import('@/features/dashboard/pages/DashboardPage.vue'),
        meta: { title: 'Dashboard' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: RouteName.NotFound,
    component: () => import('@/app/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]

/** The portal's primary navigation. Sourced here so the sidebar cannot drift from the router. */
export interface NavigationItem {
  name: RouteNameValue
  label: string
  icon: string
}

export const NAVIGATION: NavigationItem[] = [
  { name: RouteName.Dashboard, label: 'Dashboard', icon: 'pi pi-chart-bar' },
]
