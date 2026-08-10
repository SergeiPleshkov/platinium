/**
 * The path every mock endpoint is mounted under.
 *
 * Kept relative so the same handlers work in the browser (same-origin `/api/...`) and in
 * Vitest, where the client resolves against the jsdom origin.
 */
export const API_BASE = '/api'
