import { describe, expect, it } from 'vitest'

import { loginSchema } from '@/features/auth/schema'

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'admin@example.com', password: 'secret' })
    expect(result.success).toBe(true)
  })

  it('normalises a surrounding-whitespace email', () => {
    const result = loginSchema.parse({ email: '  admin@example.com ', password: 'secret' })
    expect(result.email).toBe('admin@example.com')
  })

  it.each([
    ['', 'Enter your email address'],
    ['   ', 'Enter your email address'],
    ['not-an-email', 'Enter a valid email address'],
    ['missing@domain', 'Enter a valid email address'],
  ])('rejects the email %j', (email, expected) => {
    const result = loginSchema.safeParse({ email, password: 'secret' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(expected)
    }
  })

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'admin@example.com', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Enter your password')
    }
  })
})
