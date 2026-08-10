/**
 * Triggers a browser download for data the app already holds.
 *
 * The object URL is revoked immediately after the click. Without that, every export leaks the
 * whole blob for the lifetime of the tab — invisible in testing and very visible to an admin
 * who exports thirty times in an afternoon.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)

  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    // Appending is required by Firefox; a detached anchor's click is ignored there.
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** `tickets` → `tickets-2026-08-10.csv`. Dated so successive exports do not overwrite. */
export function timestampedFilename(base: string, extension: string, now = new Date()): string {
  return `${base}-${now.toISOString().slice(0, 10)}.${extension}`
}
