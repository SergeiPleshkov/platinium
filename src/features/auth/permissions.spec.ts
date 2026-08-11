import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isReadOnly,
  roleCan,
  type Permission,
} from '@/features/auth/permissions'
import { USER_ROLES, type UserRole } from '@/features/auth/types'

/**
 * The permission matrix.
 *
 * Worth testing exhaustively rather than by example, because the failure mode is silent: a
 * role that quietly gains `delete` looks exactly like a role that always had it. The table
 * below restates the intended matrix independently of the implementation, so changing one
 * without the other fails.
 */

const EXPECTED: Record<UserRole, Record<Permission, boolean>> = {
  admin: { create: true, update: true, delete: true, export: true, import: true },
  editor: { create: true, update: true, delete: false, export: true, import: true },
  viewer: { create: false, update: false, delete: false, export: true, import: false },
}

describe('roleCan', () => {
  for (const role of USER_ROLES) {
    for (const permission of PERMISSIONS) {
      const allowed = EXPECTED[role][permission]
      it(`${allowed ? 'allows' : 'refuses'} ${role} to ${permission}`, () => {
        expect(roleCan(role, permission)).toBe(allowed)
      })
    }
  }

  it('refuses everything when there is no role', () => {
    // Signed out, or a session still being restored. "No" is the safe answer while unknown.
    for (const permission of PERMISSIONS) {
      expect(roleCan(null, permission)).toBe(false)
      expect(roleCan(undefined, permission)).toBe(false)
    }
  })

  it('gives editors everything except delete', () => {
    // The one distinction the matrix exists to draw, stated once in plain terms.
    const editor = ROLE_PERMISSIONS.editor
    expect(editor).not.toContain('delete')
    expect([...editor].sort()).toEqual(['create', 'export', 'import', 'update'])
  })

  it('covers every role, so a new one cannot be added without a decision', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...USER_ROLES].sort())
  })
})

describe('isReadOnly', () => {
  it.each([
    ['admin', false],
    ['editor', false],
    ['viewer', true],
  ] as const)('%s → %s', (role, expected) => {
    expect(isReadOnly(role)).toBe(expected)
  })

  it('treats a missing role as read-only', () => {
    expect(isReadOnly(null)).toBe(true)
  })
})
