import { describe, expect, it } from 'vitest'

import { categorySchema } from '@/features/categories/schema'

describe('categorySchema', () => {
  it('accepts a valid category', () => {
    const result = categorySchema.safeParse({ name: 'VIP', description: 'Premium seating' })
    expect(result.success).toBe(true)
  })

  it('treats the description as optional and defaults it to an empty string', () => {
    const result = categorySchema.parse({ name: 'VIP' })
    expect(result.description).toBe('')
  })

  it('trims whitespace', () => {
    const result = categorySchema.parse({ name: '  VIP  ', description: '  Premium  ' })
    expect(result).toEqual({ name: 'VIP', description: 'Premium' })
  })

  it.each([
    ['', 'Enter a category name'],
    ['   ', 'Enter a category name'],
    ['x'.repeat(81), 'Category name must be 80 characters or fewer'],
  ])('rejects the name %j', (name, expected) => {
    const result = categorySchema.safeParse({ name, description: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(expected)
    }
  })

  it('rejects an over-long description', () => {
    const result = categorySchema.safeParse({ name: 'VIP', description: 'x'.repeat(501) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Description must be 500 characters or fewer')
    }
  })
})
