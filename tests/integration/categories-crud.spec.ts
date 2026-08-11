import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { http as mswHttp, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '@/app/App.vue'
import { db } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderWithApp } from '@tests/utils/renderWithApp'
import { signInViaUi } from '@tests/utils/signInViaUi'

/**
 * The complete category journey, through the router, against the real mock backend.
 *
 * No stubbed store, no stubbed API, no stubbed child components, if the wiring between the
 * page, the table engine, the store and the HTTP layer is wrong, these fail.
 */

const ORIGIN = window.location.origin

async function signInAndOpenCategories(): Promise<Awaited<ReturnType<typeof renderWithApp>>> {
  const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
  await signInViaUi()
  await rendered.router.push('/categories')
  await screen.findByRole('heading', { name: 'Categories' })

  return rendered
}

beforeEach(() => {
  localStorage.clear()
})

describe('categories CRUD', () => {
  it('lists the seeded categories', async () => {
    await signInAndOpenCategories()

    expect(await screen.findByText('VIP')).toBeInTheDocument()
    expect(screen.getByText('General Admission')).toBeInTheDocument()
  })

  it('creates a category and shows it in the table', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'New category' }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Press Gallery')
    await userEvent.type(within(dialog).getByLabelText(/Description/), 'Accredited media.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }))

    expect(await screen.findByText('Press Gallery')).toBeInTheDocument()
    expect(db.categories.some((category) => category.name === 'Press Gallery')).toBe(true)
  })

  it('validates before sending anything to the server', async () => {
    await signInAndOpenCategories()

    await userEvent.click(screen.getByRole('button', { name: 'New category' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }))

    expect(await within(dialog).findByText('Enter a category name')).toBeInTheDocument()
    // The dialog stays open: a rejected submit must not discard what was typed.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('places a server-side 422 on the field that caused it', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'New category' }))
    const dialog = await screen.findByRole('dialog')
    // "VIP" already exists, a rule only the server can enforce.
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'VIP')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }))

    expect(await within(dialog).findByText(/already exists/i)).toBeInTheDocument()
  })

  it('edits a category and shows the change', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'Edit VIP' }))

    const dialog = await screen.findByRole('dialog')
    const nameField = within(dialog).getByLabelText(/Name/)
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'VIP Plus')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('VIP Plus')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('VIP')).not.toBeInTheDocument()
    })
  })

  it('pre-fills the edit form with the record being edited', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'Edit VIP' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText<HTMLInputElement>(/Name/).value).toBe('VIP')
  })

  it('confirms before deleting, and cancelling keeps the row', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'Delete VIP' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/permanently deleted/i)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('VIP')).toBeInTheDocument()
  })

  it('deletes a category that has no tickets', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    // Create one first, so the delete is not blocked by referential integrity.
    await userEvent.click(screen.getByRole('button', { name: 'New category' }))
    const createDialog = await screen.findByRole('dialog')
    await userEvent.type(within(createDialog).getByLabelText(/Name/), 'Disposable')
    await userEvent.click(within(createDialog).getByRole('button', { name: 'Create category' }))
    await screen.findByText('Disposable')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Disposable' }))
    const confirm = await screen.findByRole('dialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete category' }))

    await waitFor(() => {
      expect(screen.queryByText('Disposable')).not.toBeInTheDocument()
    })
  })

  it('explains, in the dialog, why a category in use cannot be deleted', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.click(screen.getByRole('button', { name: 'Delete VIP' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }))

    // The obstacle is named where the action was taken, not in a toast that disappears.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/still has \d+ ticket/i)
    expect(screen.getByText('VIP')).toBeInTheDocument()
  })

  it('searches server-side and offers to clear a filter that matches nothing', async () => {
    await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.type(screen.getByLabelText('Search categories'), 'zzz-no-such-tier')

    expect(await screen.findByText('No matches')).toBeInTheDocument()
    expect(screen.queryByText('VIP')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('VIP')).toBeInTheDocument()
  })

  it('renders the error state with a working retry', async () => {
    server.use(
      mswHttp.get(`${ORIGIN}/api/categories`, () =>
        HttpResponse.json({ message: 'Server exploded.' }, { status: 500 }),
      ),
    )

    await signInAndOpenCategories()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Server exploded.')

    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))

    expect(await screen.findByText('VIP')).toBeInTheDocument()
  })

  it('keeps the search term in the URL so the view is shareable', async () => {
    const { router } = await signInAndOpenCategories()
    await screen.findByText('VIP')

    await userEvent.type(screen.getByLabelText('Search categories'), 'VIP')

    await waitFor(() => {
      expect(router.currentRoute.value.query['search']).toBe('VIP')
    })
  })

  it('restores search from the URL on load', async () => {
    const rendered = await renderWithApp(App, { initialRoute: '/login', withGuards: true })
    await signInViaUi()

    await rendered.router.push('/categories?search=VIP')

    expect(await screen.findByText('VIP')).toBeInTheDocument()
    expect(screen.queryByText('General Admission')).not.toBeInTheDocument()
  })
})
