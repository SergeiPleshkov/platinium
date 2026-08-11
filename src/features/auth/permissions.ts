import type { UserRole } from '@/features/auth/types'

/**
 * What each role is allowed to do.
 *
 * Capabilities, not roles, are what the rest of the application asks about. A button that
 * checks `can('delete')` keeps working when a fourth role appears; one that checks
 * `role === 'admin'` has to be found and edited, and the ones nobody finds are the bugs.
 *
 * This module is imported by **both** the UI and the mock backend, deliberately: a permission
 * model that exists only in the client is decoration, because the request still succeeds.
 * `src/mocks/support.ts` re-checks every mutation against this same table, and
 * `tests/mock-api/permissions.spec.ts` proves a forbidden request is refused even when the UI
 * would never have sent it.
 */

export const PERMISSIONS = ['create', 'update', 'delete', 'export', 'import'] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * The matrix.
 *
 * `editor` deliberately gets everything except `delete`. That is the distinction worth
 * modelling in a ticketing back office: creating and correcting records is routine work,
 * while destroying one with sales against it is not.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ['create', 'update', 'delete', 'export', 'import'],
  editor: ['create', 'update', 'export', 'import'],
  viewer: ['export'],
}

/**
 * Whether a role may perform an action.
 *
 * A `null` role, signed out, or a session still being restored, is denied everything. The
 * safe answer while the truth is unknown is "no": a button that flickers into existence and
 * then fails is worse than one that appears a moment late.
 */
export function roleCan(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** True when a role may change nothing, used to label the UI honestly rather than just hide it. */
export function isReadOnly(role: UserRole | null | undefined): boolean {
  return !roleCan(role, 'create') && !roleCan(role, 'update') && !roleCan(role, 'delete')
}
