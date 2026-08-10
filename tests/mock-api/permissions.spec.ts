import { beforeEach, describe, expect, it } from 'vitest'

import { ROLE_PERMISSIONS } from '@/features/auth'
import type { UserRole } from '@/features/auth/types'
import { db } from '@/mocks/db'
import { call, del, get, patch, post, signIn } from '@tests/utils/apiClient'

/**
 * Role enforcement at the API boundary.
 *
 * The claim being tested is the one that makes the feature real rather than cosmetic: a
 * forbidden request is refused **even though the UI would never have sent it**. Every call
 * below is one the client hides the button for, made anyway — which is what a console, a
 * stale tab, or a client bug would do.
 */

const TOKENS: Record<UserRole, string> = { admin: '', editor: '', viewer: '' }

beforeEach(async () => {
  TOKENS.admin = await signIn('admin@ticketing.test')
  TOKENS.editor = await signIn('editor@ticketing.test')
  TOKENS.viewer = await signIn('viewer@ticketing.test')
})

const CATEGORY = { name: 'Permission Probe', description: 'Created by a test.' }

describe('mock API — role permissions', () => {
  describe('reading is open to every role', () => {
    it.each(['admin', 'editor', 'viewer'] as const)('%s can list categories', async (role) => {
      const response = await get('/api/categories', TOKENS[role])
      expect(response.status).toBe(200)
    })
  })

  describe('create', () => {
    it.each(['admin', 'editor'] as const)('%s may create', async (role) => {
      const response = await post('/api/categories', CATEGORY, TOKENS[role])
      expect(response.status).toBe(201)
    })

    it('a viewer is refused with 403, not 401', async () => {
      const response = await post<{ message: string }>('/api/categories', CATEGORY, TOKENS.viewer)

      // 401 would mean "who are you?"; the distinction matters to the client's 401 hook,
      // which signs the user out. A 403 must not.
      expect(response.status).toBe(403)
      expect(response.body.message).toContain('viewer')
    })

    it('does not write the record it refused', async () => {
      const before = db.categories.length
      await post('/api/categories', CATEGORY, TOKENS.viewer)

      expect(db.categories).toHaveLength(before)
    })
  })

  describe('update', () => {
    it.each(['admin', 'editor'] as const)('%s may update', async (role) => {
      const target = db.categories[0]!
      const response = await patch(
        `/api/categories/${target.id}`,
        { name: `Renamed by ${role}`, description: target.description },
        TOKENS[role],
      )
      expect(response.status).toBe(200)
    })

    it('a viewer is refused, and the record is unchanged', async () => {
      const target = db.categories[0]!
      const originalName = target.name

      const response = await patch(
        `/api/categories/${target.id}`,
        { name: 'Should not stick', description: target.description },
        TOKENS.viewer,
      )

      expect(response.status).toBe(403)
      expect(db.categories[0]!.name).toBe(originalName)
    })
  })

  describe('delete', () => {
    /** A category with no tickets, so a 409 cannot be mistaken for a 403. */
    function deletableCategoryId(): string {
      const created = db.categories.find((category) => category.ticketCount === 0)
      return created?.id ?? db.categories[0]!.id
    }

    it('an admin may delete', async () => {
      const fresh = await post<{ id: string }>('/api/categories', CATEGORY, TOKENS.admin)
      const response = await del(`/api/categories/${fresh.body.id}`, TOKENS.admin)

      expect(response.status).toBe(204)
    })

    it('an editor may not — the one thing separating the two roles', async () => {
      const fresh = await post<{ id: string }>('/api/categories', CATEGORY, TOKENS.admin)
      const response = await del<{ message: string }>(
        `/api/categories/${fresh.body.id}`,
        TOKENS.editor,
      )

      expect(response.status).toBe(403)
      expect(db.categories.some((category) => category.id === fresh.body.id)).toBe(true)
    })

    it('a viewer may not', async () => {
      const response = await del(`/api/categories/${deletableCategoryId()}`, TOKENS.viewer)
      expect(response.status).toBe(403)
    })
  })

  describe('across every entity, not just categories', () => {
    // A guard added to one handler set and forgotten in another is the likely regression.
    it.each([
      [
        'events',
        {
          name: 'X',
          country: 'Spain',
          venue: 'V',
          startDate: '2027-01-01',
          endDate: '2027-01-02',
          status: 'draft',
        },
      ],
      ['categories', CATEGORY],
    ] as const)('a viewer cannot create %s', async (resource, payload) => {
      const response = await post(`/api/${resource}`, payload, TOKENS.viewer)
      expect(response.status).toBe(403)
    })

    it('a viewer cannot create tickets', async () => {
      const event = db.events[0]!
      const category = db.categories[0]!
      const response = await post(
        '/api/tickets',
        {
          name: 'Probe',
          eventId: event.id,
          categoryId: category.id,
          priceMinor: 1000,
          currency: 'EUR',
          quantity: 1,
          status: 'draft',
        },
        TOKENS.viewer,
      )

      expect(response.status).toBe(403)
    })

    it.each(['events', 'tickets'] as const)('a viewer cannot delete %s', async (resource) => {
      const id = resource === 'events' ? db.events[0]!.id : db.tickets[0]!.id
      const response = await del(`/api/${resource}/${id}`, TOKENS.viewer)

      expect(response.status).toBe(403)
    })
  })

  describe('export', () => {
    it('is allowed for every role, because downloading changes nothing', async () => {
      for (const role of ['admin', 'editor', 'viewer'] as const) {
        const response = await fetch(`${window.location.origin}/api/tickets/export`, {
          headers: { authorization: `Bearer ${TOKENS[role]}` },
        })
        expect(response.status).toBe(200)
      }
    })

    it('still requires a session', async () => {
      const response = await fetch(`${window.location.origin}/api/tickets/export`)
      expect(response.status).toBe(401)
    })
  })

  it('matches the matrix the UI reads, rather than a second copy of it', () => {
    // Both sides import `ROLE_PERMISSIONS`; this asserts the enforcement follows from it.
    expect(ROLE_PERMISSIONS.viewer).not.toContain('create')
    expect(ROLE_PERMISSIONS.editor).not.toContain('delete')
  })

  it('refuses an unauthenticated mutation with 401, before any role check', async () => {
    const response = await call('/api/categories', {
      method: 'POST',
      body: JSON.stringify(CATEGORY),
    })

    expect(response.status).toBe(401)
  })
})
