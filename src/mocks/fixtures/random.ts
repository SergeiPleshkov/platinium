/**
 * A seeded pseudo-random generator.
 *
 * Fixtures need to *look* varied without *being* random: a test that asserts "page 2 sorted
 * by price starts with X" must give the same answer on every machine and every run.
 * `Math.random()` would make the seed data — and therefore those assertions — non-reproducible.
 *
 * mulberry32: small, fast, and good enough for generating plausible demo data.
 */
export function createRandom(seed: number): {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: readonly T[]) => T
  bool: (probability?: number) => boolean
} {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  /** Inclusive on both ends. */
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)]
    if (item === undefined) {
      throw new Error('createRandom.pick called with an empty list')
    }
    return item
  }

  const bool = (probability = 0.5): boolean => next() < probability

  return { next, int, pick, bool }
}

/** Zero-padded sequential id, e.g. `evt_007`. Readable in test failures, unlike a UUID. */
export function sequentialId(prefix: string, index: number, width = 3): string {
  return `${prefix}_${String(index).padStart(width, '0')}`
}
