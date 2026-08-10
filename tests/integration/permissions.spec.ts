import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import type { UserRole } from '@/features/auth/types'
import { db } from '@/mocks/db'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Role-based permissions, as the user experiences them.
 *
 * The API side is covered by `tests/mock-api/permissions.spec.ts`, which proves a forbidden
 * request is refused. This covers the other half: that the interface does not offer actions
 * the session cannot perform, and — the part that is easy to get wrong — that it *says so*
 * rather than silently rendering fewer buttons.
 */

const EMAILS: Record<UserRole, string> = {
  admin: 'admin@ticketing.test',
  editor: 'editor@ticketing.test',
  viewer: 'viewer@ticketing.test',
}

async function openCategoriesAs(role: UserRole): Promise<void> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })

  await userEvent.type(await screen.findByLabelText(/Email address/), EMAILS[role])
  await userEvent.type(screen.getByLabelText(/Password/), 'password123')
  await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
  await screen.findByRole('heading', { name: 'Dashboard' })

  await rendered.router.push('/categories')
  await screen.findByRole('heading', { name: 'Categories' })
  await screen.findByText('VIP')
}

beforeEach(() => {
  localStorage.clear()
})

describe('permissions in the UI', () => {
  describe('an administrator', () => {
    it('is offered every action', async () => {
      await openCategoriesAs('admin')

      expect(screen.getByRole('button', { name: 'New category' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit VIP' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete VIP' })).toBeInTheDocument()
    })

    it('is not labelled read-only', async () => {
      await openCategoriesAs('admin')

      expect(screen.queryByText('Read only')).not.toBeInTheDocument()
    })
  })

  describe('an editor', () => {
    it('may create and edit', async () => {
      await openCategoriesAs('editor')

      expect(screen.getByRole('button', { name: 'New category' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit VIP' })).toBeInTheDocument()
    })

    it('is not offered delete — the one action separating it from admin', async () => {
      await openCategoriesAs('editor')

      expect(screen.queryByRole('button', { name: 'Delete VIP' })).not.toBeInTheDocument()
    })

    it('keeps the actions column, because edit is still available', async () => {
      await openCategoriesAs('editor')

      expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    })
  })

  describe('a viewer', () => {
    it('is offered no create, edit or delete', async () => {
      await openCategoriesAs('viewer')

      expect(screen.queryByRole('button', { name: 'New category' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit VIP' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete VIP' })).not.toBeInTheDocument()
    })

    it('is told why, rather than left with a page that looks broken', async () => {
      await openCategoriesAs('viewer')

      expect(screen.getByText('Read only')).toBeInTheDocument()
    })

    it('loses the actions column entirely, not just its buttons', async () => {
      await openCategoriesAs('viewer')

      // An empty column under an "Actions" header is worse than no column.
      expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    })

    it('can still read the data', async () => {
      await openCategoriesAs('viewer')

      expect(screen.getByText('VIP')).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
    })

    it('may still export, which changes nothing', async () => {
      const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
      await userEvent.type(await screen.findByLabelText(/Email address/), EMAILS.viewer)
      await userEvent.type(screen.getByLabelText(/Password/), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
      await screen.findByRole('heading', { name: 'Dashboard' })

      await rendered.router.push('/tickets')
      await screen.findByRole('heading', { name: 'Tickets' })

      expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument()
    })
  })

  describe('the server has the final say', () => {
    it('refuses a write the UI would have hidden, leaving the data untouched', async () => {
      /*
       * Signed in as a viewer, the store is driven directly — standing in for a request that
       * did not come from a button. The UI gate is a convenience; this is the guarantee.
       */
      const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
      await userEvent.type(await screen.findByLabelText(/Email address/), EMAILS.viewer)
      await userEvent.type(screen.getByLabelText(/Password/), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
      await screen.findByRole('heading', { name: 'Dashboard' })

      const { useCategoriesStore } = await import('@/features/categories')
      const store = useCategoriesStore(rendered.pinia)
      const before = db.categories.length

      await expect(
        store.create({ name: 'Smuggled', description: 'Should not exist.' }),
      ).rejects.toMatchObject({ status: 403 })

      expect(db.categories).toHaveLength(before)
    })

    it('does not sign the user out over a 403', async () => {
      // The 401 hook ends the session. A 403 means "not allowed", not "not signed in" —
      // conflating them would eject a viewer from the app for clicking the wrong thing.
      const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
      await userEvent.type(await screen.findByLabelText(/Email address/), EMAILS.viewer)
      await userEvent.type(screen.getByLabelText(/Password/), 'password123')
      await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
      await screen.findByRole('heading', { name: 'Dashboard' })

      const { useCategoriesStore } = await import('@/features/categories')
      const { useAuthStore } = await import('@/features/auth')
      const store = useCategoriesStore(rendered.pinia)

      await store.create({ name: 'Smuggled', description: '' }).catch(() => undefined)

      await waitFor(() => {
        expect(useAuthStore(rendered.pinia).isAuthenticated).toBe(true)
      })
    })
  })

  describe('navigation is unaffected', () => {
    it('shows a viewer every destination', async () => {
      await openCategoriesAs('viewer')
      const nav = screen.getByRole('navigation', { name: 'Primary' })

      // Read access is universal here; hiding the pages would be a different feature.
      for (const label of ['Dashboard', 'Events', 'Tickets', 'Categories']) {
        expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
      }
    })
  })
})
