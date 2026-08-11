/**
 * The auth feature's public surface. Other layers import from here, never from its internals.
 */
export { useAuthStore } from '@/features/auth/store'
export { loginSchema, type LoginFormValues } from '@/features/auth/schema'
export { usePermissions, type UsePermissions } from '@/features/auth/composables/usePermissions'
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isReadOnly,
  roleCan,
  type Permission,
} from '@/features/auth/permissions'
export {
  USER_ROLES,
  USER_ROLE_LABELS,
  type AuthSession,
  type LoginPayload,
  type User,
  type UserPreferences,
  type UserRole,
} from '@/features/auth/types'
