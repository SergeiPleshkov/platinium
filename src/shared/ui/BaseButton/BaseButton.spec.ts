import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * These assertions target the accessible surface, role, name, disabled state, not
 * PrimeVue's markup. That is deliberate: the suite must survive replacing the UI kit.
 */
describe('BaseButton', () => {
  it('renders its slot content as the accessible name', async () => {
    await renderWithApp(BaseButton, { slots: { default: 'Create event' } })

    expect(screen.getByRole('button', { name: 'Create event' })).toBeInTheDocument()
  })

  it('emits click when pressed', async () => {
    const { emitted } = await renderWithApp(BaseButton, { slots: { default: 'Save' } })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(emitted()['click']).toHaveLength(1)
  })

  it('blocks interaction and reports busy state while loading', async () => {
    const { emitted } = await renderWithApp(BaseButton, {
      props: { loading: true },
      slots: { default: 'Save' },
    })

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    await userEvent.click(button)
    expect(emitted()['click']).toBeUndefined()
  })

  it('blocks interaction when disabled', async () => {
    const { emitted } = await renderWithApp(BaseButton, {
      props: { disabled: true },
      slots: { default: 'Delete' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(emitted()['click']).toBeUndefined()
  })

  it('exposes an accessible name for icon-only buttons', async () => {
    await renderWithApp(BaseButton, {
      props: { icon: 'pi pi-trash' },
      attrs: { 'aria-label': 'Delete ticket' },
    })

    expect(screen.getByRole('button', { name: 'Delete ticket' })).toBeInTheDocument()
  })

  it.each([['primary'], ['secondary'], ['danger'], ['ghost']])(
    'renders the %s variant as a usable button',
    async (variant) => {
      await renderWithApp(BaseButton, { props: { variant }, slots: { default: 'Action' } })

      expect(screen.getByRole('button', { name: 'Action' })).toBeEnabled()
    },
  )
})
