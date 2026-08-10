import { ticketSchema } from '@/features/tickets/schema'
import type { Ticket } from '@/features/tickets/types'
import { db, nextId, nowIso, syncDerivedCounts } from '@/mocks/db'
import {
  IMPORT_ROW_LIMIT,
  type ImportRequest,
  type ImportResult,
  type ImportRowError,
} from '@/shared/types/import'

/**
 * Ticket import: validate every row, report every failure, write only when asked.
 *
 * The columns are the *export's* columns, so a file this application produced can be edited
 * in a spreadsheet and fed straight back. `ID` and `Created` are accepted and ignored rather
 * than rejected — a round trip that fails because the file still has the column it was given
 * would be a poor joke.
 *
 * Relations arrive as **names**, because that is what a human editing a spreadsheet has in
 * front of them. Resolving them is the server's job: asking the client to would mean it first
 * downloading every event, which is the pattern this application argues against everywhere
 * else.
 */

/** Canonical column names, matching the export's headers once lower-cased. */
const COLUMNS = {
  name: 'name',
  event: 'event',
  category: 'category',
  price: 'price (minor units)',
  currency: 'currency',
  quantity: 'quantity',
  status: 'status',
} as const

/**
 * Schema field names, translated back into the file's column headings.
 *
 * An error has to name something the user can find. `status` is the schema's word for it; the
 * file's word is `Status`, and that is the one in the spreadsheet they are about to open.
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  priceMinor: 'Price (minor units)',
  currency: 'Currency',
  quantity: 'Quantity',
  status: 'Status',
}

/** `line` is 1-based *including* the header, so it matches a spreadsheet's gutter. */
function lineOf(index: number): number {
  return index + 2
}

function parseInteger(raw: string): number | null {
  if (raw === '') return null
  // `Number` on its own accepts '1e3', ' 12 ' and '0x10'; none of those belong in this column.
  if (!/^-?\d+$/.test(raw)) return null
  return Number(raw)
}

interface Resolved {
  ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>
}

/** Validates one row into a ticket, or returns everything wrong with it. */
function resolveRow(row: Record<string, string>, line: number): Resolved | ImportRowError[] {
  const errors: ImportRowError[] = []

  const eventName = (row[COLUMNS.event] ?? '').trim()
  const categoryName = (row[COLUMNS.category] ?? '').trim()

  const event = db.events.find(
    (candidate) => candidate.name.toLowerCase() === eventName.toLowerCase(),
  )
  const category = db.categories.find(
    (candidate) => candidate.name.toLowerCase() === categoryName.toLowerCase(),
  )

  if (!event) {
    errors.push({
      line,
      field: 'Event',
      reason: eventName === '' ? 'Event is required.' : `No event named “${eventName}”.`,
    })
  }
  if (!category) {
    errors.push({
      line,
      field: 'Category',
      reason:
        categoryName === '' ? 'Category is required.' : `No category named “${categoryName}”.`,
    })
  }

  const priceRaw = (row[COLUMNS.price] ?? '').trim()
  const price = parseInteger(priceRaw)
  if (price === null) {
    errors.push({
      line,
      field: 'Price (minor units)',
      reason:
        priceRaw === ''
          ? 'Price is required.'
          : `“${priceRaw}” is not a whole number of minor units.`,
    })
  }

  const quantityRaw = (row[COLUMNS.quantity] ?? '').trim()
  const quantity = parseInteger(quantityRaw)
  if (quantity === null) {
    errors.push({
      line,
      field: 'Quantity',
      reason: quantityRaw === '' ? 'Quantity is required.' : `“${quantityRaw}” is not a number.`,
    })
  }

  /*
   * The same schema the form and the single-record endpoint use. Anything it rejects is
   * rejected here in the same words — an import cannot become a way in for a record the
   * create form would refuse.
   */
  const candidate = {
    name: (row[COLUMNS.name] ?? '').trim(),
    priceMinor: price ?? 0,
    currency: (row[COLUMNS.currency] ?? '').trim().toUpperCase(),
    quantity: quantity ?? 0,
    status: (row[COLUMNS.status] ?? '').trim().toLowerCase().replace(/\s+/g, '_'),
    eventId: event?.id ?? '',
    categoryId: category?.id ?? '',
  }

  const parsed = ticketSchema.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.map(String).join('.')
      // Relation and number problems are already reported above, in the file's own vocabulary.
      if (['eventId', 'categoryId'].includes(field)) continue
      if (field === 'priceMinor' && price === null) continue
      if (field === 'quantity' && quantity === null) continue
      errors.push({ line, field: FIELD_LABELS[field] ?? field ?? 'Row', reason: issue.message })
    }
  }

  if (errors.length > 0) return errors
  return { ticket: parsed.success ? parsed.data : (candidate as Resolved['ticket']) }
}

export function importTickets(payload: ImportRequest): ImportResult {
  const rows = payload.rows.slice(0, IMPORT_ROW_LIMIT)

  const errors: ImportRowError[] = []
  const ready: Array<Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>> = []

  rows.forEach((row, index) => {
    const outcome = resolveRow(row, lineOf(index))
    if (Array.isArray(outcome)) errors.push(...outcome)
    else ready.push(outcome.ticket)
  })

  /*
   * Valid rows are written even when others failed — the same partial-success stance the bulk
   * endpoint takes, and for the same reason: rejecting 900 good rows because 3 are wrong makes
   * the feature useless on exactly the files that need it.
   */
  if (!payload.dryRun && ready.length > 0) {
    const timestamp = nowIso()
    for (const ticket of ready) {
      db.tickets.push({ ...ticket, id: nextId('tkt'), createdAt: timestamp, updatedAt: timestamp })
    }
    syncDerivedCounts()
  }

  return {
    total: rows.length,
    accepted: ready.length,
    errors,
    dryRun: payload.dryRun,
  }
}

export function isImportRequest(raw: unknown): raw is ImportRequest {
  if (typeof raw !== 'object' || raw === null) return false

  const candidate = raw as Partial<ImportRequest>
  if (typeof candidate.dryRun !== 'boolean') return false
  if (!Array.isArray(candidate.rows)) return false

  return candidate.rows.every((row) => typeof row === 'object' && row !== null)
}
