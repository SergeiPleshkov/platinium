import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import BaseSegmentedControl from '@/shared/ui/BaseSegmentedControl/BaseSegmentedControl.vue'

/**
 * The segmented control's contract is its semantics: one radio group, one checked option,
 * arrow keys move the choice, and Tab treats the whole group as a single stop. That is the
 * reason it is hand-written rather than a `SelectButton` wrapper, so it is what gets tested.
 */

const options = [
  { value: 'paginated', label: 'Pages' },
  { value: 'virtual', label: 'Virtual' },
] as const

function renderControl(modelValue: 'paginated' | 'virtual' = 'paginated') {
  return render(BaseSegmentedControl, {
    props: { modelValue, options, label: 'Row rendering strategy' },
  })
}

describe('BaseSegmentedControl', () => {
  it('is a labelled radio group', () => {
    renderControl()

    expect(screen.getByRole('radiogroup', { name: 'Row rendering strategy' })).toBeInTheDocument()
  })

  it('marks exactly one option as checked', () => {
    renderControl('virtual')

    expect(screen.getByRole('radio', { name: 'Virtual' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pages' })).not.toBeChecked()
  })

  it('emits the new value on click', async () => {
    const { emitted } = renderControl('paginated')

    await userEvent.click(screen.getByRole('radio', { name: 'Virtual' }))

    expect(emitted()['update:modelValue']).toEqual([['virtual']])
  })

  it('stays silent when the current option is clicked again', async () => {
    const { emitted } = renderControl('paginated')

    await userEvent.click(screen.getByRole('radio', { name: 'Pages' }))

    expect(emitted()['update:modelValue']).toBeUndefined()
  })

  it('keeps only the checked option in the tab order', () => {
    renderControl('paginated')

    // One stop for the group, not one per option — the behaviour `aria-pressed` toggles lack.
    expect(screen.getByRole('radio', { name: 'Pages' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Virtual' })).toHaveAttribute('tabindex', '-1')
  })

  it.each([['{ArrowRight}'], ['{ArrowDown}']])(
    'moves the selection forward with %s',
    async (key) => {
      const { emitted } = renderControl('paginated')

      screen.getByRole('radio', { name: 'Pages' }).focus()
      await userEvent.keyboard(key)

      expect(emitted()['update:modelValue']).toEqual([['virtual']])
    },
  )

  it('wraps around at the end', async () => {
    const { emitted } = renderControl('virtual')

    screen.getByRole('radio', { name: 'Virtual' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(emitted()['update:modelValue']).toEqual([['paginated']])
  })

  it('ignores keys that are not arrows', async () => {
    const { emitted } = renderControl('paginated')

    screen.getByRole('radio', { name: 'Pages' }).focus()
    await userEvent.keyboard('a')

    expect(emitted()['update:modelValue']).toBeUndefined()
  })
})
