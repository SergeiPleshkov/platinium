import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { NAVIGATION } from '@/app/router/routes'
import { useAuthStore } from '@/features/auth'
import { useSidebar } from '@/shared/composables'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { MOBILE_WIDTH, setViewportWidth } from '@tests/utils/viewport'

/**
 * The portal shell.
 *
 * The claims worth pinning here are the ones a refactor could quietly break: that there is
 * exactly *one* navigation, that collapsing the desktop rail hides labels visually without
 * removing them from the accessibility tree, and that the collapse preference does not follow
 * the user down to the mobile drawer.
 *
 * Mounts `App`, not `PortalLayout`. Mounting the layout directly renders it *twice* — the
 * router still matches it at depth 0, so the component's own `<RouterView>` resolves to
 * itself — and a duplicated shell is precisely what the first assertion here is meant to
 * catch. A fixture that manufactures the bug it is testing for is worse than no fixture.
 */

async function renderShell(): Promise<void> {
  const { pinia } = await renderWithApp(App, { initialRoute: '/dashboard' })
  // A real session from the mock backend, so the header renders the identity it would in life.
  await useAuthStore(pinia).login({ email: 'admin@ticketing.test', password: 'password123' })
}

beforeEach(() => {
  localStorage.clear()
})

describe('PortalLayout', () => {
  it('renders exactly one navigation landmark', async () => {
    await renderShell()

    // Two navs means two sources of truth, which is the bug this asserts against.
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('renders every destination the router declares', async () => {
    await renderShell()
    const nav = screen.getByRole('navigation', { name: 'Primary' })

    for (const item of NAVIGATION) {
      expect(within(nav).getByRole('link', { name: item.label })).toBeInTheDocument()
    }
  })

  describe('the desktop rail', () => {
    it('offers a collapse control', async () => {
      await renderShell()

      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    })

    it('keeps every link reachable by name once collapsed', async () => {
      await renderShell()
      await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

      const nav = screen.getByRole('navigation', { name: 'Primary' })
      for (const item of NAVIGATION) {
        // The label is visually hidden, not deleted — a name-based query must still find it.
        expect(within(nav).getByRole('link', { name: item.label })).toBeInTheDocument()
      }
    })

    it('hides the labels visually and titles the links instead', async () => {
      await renderShell()
      await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

      const link = screen.getByRole('link', { name: 'Dashboard' })
      expect(link).toHaveAttribute('title', 'Dashboard')
      expect(within(link).getByText('Dashboard')).toHaveClass('sr-only')
    })

    it('flips the control to expand, and back', async () => {
      await renderShell()

      await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      const expand = screen.getByRole('button', { name: 'Expand sidebar' })
      expect(expand).toHaveAttribute('aria-expanded', 'false')

      await userEvent.click(expand)
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    })

    it('persists the choice so a reload restores the rail', async () => {
      await renderShell()
      await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

      expect(localStorage.getItem('app.sidebar.collapsed')).toBe('collapsed')
    })
  })

  describe('below lg', () => {
    beforeEach(() => {
      setViewportWidth(MOBILE_WIDTH)
    })

    it('replaces the rail control with a drawer toggle', async () => {
      await renderShell()

      expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
    })

    it('shows full labels in the drawer even when the desktop rail is collapsed', async () => {
      /*
       * The stored preference is about the rail only. Honouring it here would overlay the page
       * with an unlabelled strip of glyphs — a faithful reading of the flag, and a worse
       * experience than ignoring it.
       */
      useSidebar().setCollapsed(true)
      await renderShell()
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

      const link = screen.getByRole('link', { name: 'Dashboard' })
      expect(link).not.toHaveAttribute('title')
      expect(within(link).getByText('Dashboard')).not.toHaveClass('sr-only')
    })
  })
})
