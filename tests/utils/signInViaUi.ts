import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/vue'

export type DemoAccountEmail =
  'admin@ticketing.test' | 'editor@ticketing.test' | 'viewer@ticketing.test'

/**
 * Sign in through the login page the way a person would under load.
 *
 * Uses the demo-account buttons (they set fields in one shot) instead of
 * `userEvent.type`. Under coverage, per-keystroke Vue/vee-validate re-renders
 * reorder characters and leave values like `na dTmeisnt@ tGiaclkaeting.test`,
 * which then fail the Dashboard wait and timeout the suite.
 */
export async function signInViaUi(email: DemoAccountEmail = 'admin@ticketing.test'): Promise<void> {
  const escaped = email.replace(/\./g, '\\.')
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(escaped, 'i') }))
  await userEvent.click(screen.getByRole('button', { name: /^Sign in$/i }))
  await screen.findByRole('heading', { name: 'Dashboard' })
}
