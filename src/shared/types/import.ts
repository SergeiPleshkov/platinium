/**
 * The contract for importing records from a file.
 *
 * Two decisions are encoded here.
 *
 * **The preview is a dry run of the real thing, not a second validator.** The obvious design —
 * validate in the browser to build the preview, validate again on the server to commit — has
 * two implementations of one rule, and they drift. Worse, the client cannot check the
 * interesting rules at all: whether an event of that name exists is a question only the server
 * can answer without downloading every event. So `dryRun` runs the identical code path and
 * returns the identical report, minus the writing.
 *
 * **Rows are reported by their line number in the file.** Not by index, and not by id — the
 * user is going to fix the file in a spreadsheet, and the number they need is the one in the
 * left-hand gutter.
 */

export interface ImportRequest {
  /** Each row keyed by the canonical (lower-cased) column name. */
  rows: Array<Record<string, string>>
  /** Validate and report without writing anything. */
  dryRun: boolean
}

export interface ImportRowError {
  /** 1-based line number in the source file, header included — what a spreadsheet shows. */
  line: number
  /** The column at fault, when there is one. */
  field?: string
  reason: string
}

export interface ImportResult {
  /** Rows submitted. */
  total: number
  /** Rows that would be, or were, created. */
  accepted: number
  errors: ImportRowError[]
  dryRun: boolean
}

/** Caps a single import. A larger file should be split rather than held in memory whole. */
export const IMPORT_ROW_LIMIT = 1000

export function hasImportErrors(result: ImportResult): boolean {
  return result.errors.length > 0
}
