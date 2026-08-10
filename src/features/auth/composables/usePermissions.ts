import { computed, type ComputedRef } from 'vue'

import { isReadOnly, roleCan, type Permission } from '@/features/auth/permissions'
import { useAuthStore } from '@/features/auth/store'

/**
 * The signed-in user's capabilities, as reactive predicates.
 *
 * Thin on purpose — the matrix lives in `permissions.ts`, which has no Vue in it and is what
 * the mock backend imports. This is only the binding between that table and the current
 * session, so the same rules answer for the UI and for the API.
 */

export interface UsePermissions {
  /** Reactive predicate. Prefer this in templates over comparing roles. */
  can: (permission: Permission) => boolean
  canCreate: ComputedRef<boolean>
  canUpdate: ComputedRef<boolean>
  canDelete: ComputedRef<boolean>
  canExport: ComputedRef<boolean>
  canImport: ComputedRef<boolean>
  /** True when this session may change nothing. Drives the read-only notice. */
  readOnly: ComputedRef<boolean>
}

export function usePermissions(): UsePermissions {
  const auth = useAuthStore()

  return {
    can: (permission) => roleCan(auth.role, permission),
    canCreate: computed(() => roleCan(auth.role, 'create')),
    canUpdate: computed(() => roleCan(auth.role, 'update')),
    canDelete: computed(() => roleCan(auth.role, 'delete')),
    canExport: computed(() => roleCan(auth.role, 'export')),
    canImport: computed(() => roleCan(auth.role, 'import')),
    readOnly: computed(() => isReadOnly(auth.role)),
  }
}
