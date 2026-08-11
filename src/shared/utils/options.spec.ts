import { describe, expect, it } from 'vitest'

import { mergePinnedOption } from '@/shared/utils/options'

describe('mergePinnedOption', () => {
  const alpha = { id: 'a', name: 'Alpha' }
  const beta = { id: 'b', name: 'Beta' }

  it('returns the list unchanged when there is nothing to pin', () => {
    expect(mergePinnedOption([alpha, beta], null)).toEqual([alpha, beta])
    expect(mergePinnedOption([alpha], undefined)).toEqual([alpha])
  })

  it('leaves the list alone when the pin is already present', () => {
    expect(mergePinnedOption([alpha, beta], alpha)).toEqual([alpha, beta])
  })

  it('prepends a missing pin so the select can still render its label', () => {
    expect(mergePinnedOption([beta], alpha)).toEqual([alpha, beta])
  })
})
