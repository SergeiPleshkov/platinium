/**
 * Roles are ordered by capability. Phase 8 gates actions on them in the UI *and* re-checks
 * at the mock API boundary, so the permission model is not merely cosmetic.
 */
export const USER_ROLES = ['admin', 'editor', 'viewer'] as const

export type UserRole = (typeof USER_ROLES)[number]

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthSession {
  token: string
  user: User
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  editor: 'Editor',
  viewer: 'Viewer',
}
