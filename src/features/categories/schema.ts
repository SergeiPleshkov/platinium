import { z } from 'zod'

/**
 * The single source of truth for category validation. The form, the API layer and the mock
 * backend all validate against this object, so a rule cannot be enforced in one place and
 * forgotten in another.
 *
 * Messages are user-facing copy: say what to do, never "Invalid input".
 */
export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a category name')
    .max(80, 'Category name must be 80 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .default(''),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
