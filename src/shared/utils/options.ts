import type { EntityRef } from '@/shared/types/entity'

/**
 * Page size for relation-picker queries.
 *
 * Kept small on purpose: each keystroke re-queries the server, and a long dropdown is slower to
 * scan than typing another character. The previous one-shot fetch asked for 200 and was capped
 * at 100, which made names past that window look missing rather than unloadable.
 */
export const RELATION_OPTIONS_PER_PAGE = 20

/**
 * Ensures the currently selected relation stays in the option list.
 *
 * Without this, editing a ticket whose event sorts outside the first page (or outside the
 * current search page) would blank the select: the value is still set, but PrimeVue can only
 * render a label it finds in `options`.
 */
export function mergePinnedOption(
  options: readonly EntityRef[],
  pin: EntityRef | null | undefined,
): EntityRef[] {
  if (!pin) return [...options]
  if (options.some((option) => option.id === pin.id)) return [...options]
  return [pin, ...options]
}
