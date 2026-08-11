import { onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'

import type { EntityRef } from '@/shared/types/entity'

/**
 * Abortable search+pin loader for relation pickers.
 *
 * Extracted after the ticket form and the tickets filter bar both needed the same pattern:
 * cancel the previous request, pin the selected option so the label survives pagination, and
 * dispose the controller when the scope ends.
 */

export interface RelationOptionsFetchArgs {
  search?: string
  pin?: EntityRef | null
  signal?: AbortSignal
}

export interface UseRelationOptionsLoaderOptions {
  fetchOptions: (args: RelationOptionsFetchArgs) => Promise<void>
  selectedId: MaybeRefOrGetter<string | null | undefined>
  /** Preferred pin when editing (embedded relation on the record). */
  fallback?: MaybeRefOrGetter<EntityRef | null | undefined>
  currentOptions: MaybeRefOrGetter<readonly EntityRef[]>
}

export interface UseRelationOptionsLoader {
  load: (search?: string) => void
}

export function useRelationOptionsLoader(
  options: UseRelationOptionsLoaderOptions,
): UseRelationOptionsLoader {
  let abort: AbortController | undefined

  function resolvePin(): EntityRef | null {
    const id = toValue(options.selectedId)
    if (!id) return null
    const fallback = toValue(options.fallback)
    if (fallback?.id === id) return fallback
    return toValue(options.currentOptions).find((option) => option.id === id) ?? null
  }

  function load(search = ''): void {
    abort?.abort()
    abort = new AbortController()
    void options.fetchOptions({
      search,
      pin: resolvePin(),
      signal: abort.signal,
    })
  }

  onScopeDispose(() => {
    abort?.abort()
  })

  return { load }
}
