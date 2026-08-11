/**
 * Roles are ordered by capability. Phase 8 gates actions on them in the UI *and* re-checks
 * at the mock API boundary, so the permission model is not merely cosmetic.
 */
export const USER_ROLES = ['admin', 'editor', 'viewer'] as const

export type UserRole = (typeof USER_ROLES)[number]

/**
 * Settings that belong to the person rather than to the browser.
 *
 * The distinction is what decides where a preference lives. Theme and sidebar collapse are
 * properties of *this screen*, since a laptop at night and a desktop in an office reasonably
 * differ, so they stay in `localStorage`. A dashboard arrangement is a property of the
 * person's judgement about their own work, and should follow them to another machine, so it
 * is stored against the account.
 */
export interface UserPreferences {
  /** Ordered dashboard widget ids. Absent until the user saves an arrangement. */
  dashboardOrder?: string[] | undefined
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  preferences?: UserPreferences
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
