/**
 * Date formatting.
 *
 * Parsing happens here and in `BaseDatePicker`, nowhere else, domain state stays ISO-8601
 * strings so it serialises predictably and compares by value. `Intl` does the work; a date
 * library would be several kilobytes for three functions.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** `2026-07-01T18:00:00Z` → `01 Jul 2026`. Returns an em dash for anything unparseable. */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso)
  return date ? DATE_FORMAT.format(date) : '—'
}

/** `2026-07-01T18:00:00Z` → `01 Jul 2026, 18:00`. */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso)
  return date ? DATE_TIME_FORMAT.format(date) : '—'
}

/**
 * Collapses a range to the shortest unambiguous form:
 * same day → `01 Jul 2026`, otherwise → `01 Jul 2026 – 03 Jul 2026`.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parse(startIso)
  const end = parse(endIso)

  if (!start) return '—'
  if (!end) return DATE_FORMAT.format(start)

  /*
   * Compared in *local* components, because that is what `Intl` renders. Comparing UTC days
   * against a locally-formatted label lets the two disagree: an event ending at 22:00 UTC is
   * the same UTC day as its start but renders as the next day east of Greenwich, producing
   * "01 Jul 2026" for a range the reader can see spans two dates.
   */
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()

  return sameDay
    ? DATE_FORMAT.format(start)
    : `${DATE_FORMAT.format(start)} – ${DATE_FORMAT.format(end)}`
}
