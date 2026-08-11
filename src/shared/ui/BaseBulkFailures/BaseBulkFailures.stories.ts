import type { StoryObj } from '@storybook/vue3-vite'

import BaseBulkFailures from '@/shared/ui/BaseBulkFailures/BaseBulkFailures.vue'

/**
 * What a partial bulk failure looks like.
 *
 * Seven successes and three explained refusals is not "the operation failed", and collapsing
 * it into one message would leave the admin to work out which three by hand. It renders on
 * the page rather than in a toast because it is a list somebody has to read and act on.
 */
const meta = {
  title: 'Feedback/BaseBulkFailures',
  component: BaseBulkFailures,
  tags: ['autodocs'],
  args: {
    failures: [
      { id: 'evt_004', label: 'Autumn Food Fair Paris', reason: 'Still has 12 tickets' },
      { id: 'evt_009', label: 'Winter Art Biennale', reason: 'Still has 4 tickets' },
      { id: 'evt_017', label: 'Nordic Design Summit', reason: 'No longer exists' },
    ],
  },
}

export default meta
type Story = StoryObj<typeof BaseBulkFailures>

export const Default: Story = {}

export const SingleFailure: Story = {
  args: {
    failures: [{ id: 'evt_004', label: 'Autumn Food Fair Paris', reason: 'Still has 12 tickets' }],
  },
}
