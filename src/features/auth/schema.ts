import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
  /*
   * Length only. Authentication is mocked, and inventing complexity rules here would imply a
   * password policy this app does not own; the real one belongs to the identity provider.
   */
  password: z.string().min(1, 'Enter your password'),
})

export type LoginFormValues = z.infer<typeof loginSchema>
