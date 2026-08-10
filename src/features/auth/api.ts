import type { AuthSession, LoginPayload, User } from '@/features/auth/types'
import { http } from '@/shared/api'

/**
 * Auth endpoints.
 *
 * Not built on `createResource` — authentication is not a CRUD collection, and forcing it
 * into that shape would obscure what it actually does.
 */
export const authApi = {
  login: (payload: LoginPayload): Promise<AuthSession> =>
    http.post<AuthSession>('/auth/login', payload),

  /** Validates a restored token against the server. */
  me: (): Promise<User> => http.get<User>('/auth/me'),

  logout: (): Promise<void> => http.post<void>('/auth/logout'),
}
