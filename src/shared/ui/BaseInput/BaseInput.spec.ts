import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import BaseInput from '@/shared/ui/BaseInput/BaseInput.vue'
import { renderWithApp } from '@tests/utils/renderWithApp'

/**
 * Assertions target the accessible surface — the label associates the control, the error is
 * announced, `aria-invalid` is set — because those are the guarantees, and because they
 * survive replacing the UI kit.
 */
describe('BaseInput', () => {
  it('associates its label with the control', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Email address' } })

    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('keeps the label available to screen readers when visually hidden', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Search', labelHidden: true } })

    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('updates its model as the user types', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Name', modelValue: '' } })

    await userEvent.type(screen.getByLabelText('Name'), 'Summer Gala')

    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Summer Gala')
  })

  it('announces an error and marks the control invalid', async () => {
    await renderWithApp(BaseInput, {
      props: { label: 'Name', error: 'Enter an event name' },
    })

    const input = screen.getByLabelText('Name')
    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent('Enter an event name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
  })

  it('describes the control with its hint when there is no error', async () => {
    await renderWithApp(BaseInput, {
      props: { label: 'Venue', hint: 'The building, not the city' },
    })

    const input = screen.getByLabelText('Venue')
    expect(input).toHaveAccessibleDescription('The building, not the city')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('points at the error rather than the stale hint once both are present', async () => {
    await renderWithApp(BaseInput, {
      props: { label: 'Venue', hint: 'The building, not the city', error: 'Enter a venue' },
    })

    expect(screen.getByLabelText('Venue')).toHaveAccessibleDescription('Enter a venue')
  })

  it('marks a required field for both sighted and screen-reader users', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Name', required: true } })

    // The asterisk is decorative; the word is what gets announced.
    expect(screen.getByLabelText(/Name.*\(required\)/)).toBeInTheDocument()
  })

  it('renders a password field that does not expose its value', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Password', type: 'password' } })

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('blocks input when disabled', async () => {
    await renderWithApp(BaseInput, { props: { label: 'Name', disabled: true } })

    const input = screen.getByLabelText('Name')
    expect(input).toBeDisabled()

    await userEvent.type(input, 'nope')
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('')
  })
})
