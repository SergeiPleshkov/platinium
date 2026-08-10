import { http, HttpResponse, type RequestHandler } from 'msw'

import { categorySchema } from '@/features/categories/schema'
import type { Category } from '@/features/categories/types'
import { db, nextId, nowIso, syncDerivedCounts } from '@/mocks/db'
import { API_BASE } from '@/mocks/handlers/base'
import { handleBulk } from '@/mocks/bulk'
import { runQuery } from '@/mocks/query'
import {
  errorResponse,
  notFound,
  parseBody,
  preflight,
  requireAuth,
  requirePermission,
  touch,
} from '@/mocks/support'

const RESOURCE = `${API_BASE}/categories`

function findCategory(id: string): Category | undefined {
  return db.categories.find((category) => category.id === id)
}

/** Category names are the label admins pick tickets by; two identical ones are a usability bug. */
function findDuplicateName(name: string, exceptId?: string): Category | undefined {
  const normalised = name.trim().toLowerCase()
  return db.categories.find(
    (category) => category.id !== exceptId && category.name.toLowerCase() === normalised,
  )
}

/**
 * Deletes one category, or explains why not.
 *
 * The same referential-integrity rule the single-record endpoint applies — stated once, used
 * by both, so a bulk delete cannot become a way around it.
 */
function dependentTicketCount(categoryId: string): number {
  return db.tickets.filter((ticket) => ticket.categoryId === categoryId).length
}

function deleteOneCategory(id: string): string | null {
  const category = findCategory(id)
  if (!category) return 'No longer exists.'

  const ticketCount = dependentTicketCount(id)
  if (ticketCount > 0) {
    return `Still has ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}.`
  }

  db.categories = db.categories.filter((candidate) => candidate.id !== id)
  return null
}

export const categoryHandlers: RequestHandler[] = [
  /**
   * Bulk operations.
   *
   * Declared before `/:id` so `bulk` is not captured as an id — the same ordering trap the
   * tickets export endpoint has.
   */
  http.post(`${RESOURCE}/bulk`, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    return handleBulk(request, auth.user, {
      deleteOne: deleteOneCategory,
      afterChange: syncDerivedCounts,
    })
  }),

  http.get(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const result = runQuery(db.categories, new URL(request.url), {
      searchable: (category) => [category.name, category.description],
      sortable: {
        name: (category) => category.name,
        ticketCount: (category) => category.ticketCount,
        createdAt: (category) => category.createdAt,
        updatedAt: (category) => category.updatedAt,
      },
      defaultSort: 'createdAt',
    })

    return HttpResponse.json({ data: result.data, meta: result.meta })
  }),

  http.get(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response

    const category = findCategory(String(params['id']))
    return category ? HttpResponse.json(category) : notFound('category')
  }),

  http.post(RESOURCE, async ({ request }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'create')
    if (forbidden) return forbidden

    const parsed = await parseBody(request, categorySchema)
    if (!parsed.ok) return parsed.response

    if (findDuplicateName(parsed.data.name)) {
      return errorResponse(422, 'Some of the details are not valid.', {
        name: 'A category with this name already exists',
      })
    }

    const timestamp = nowIso()
    const category: Category = {
      id: nextId('cat'),
      name: parsed.data.name,
      description: parsed.data.description,
      ticketCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    db.categories.push(category)
    return HttpResponse.json(category, { status: 201 })
  }),

  http.patch(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'update')
    if (forbidden) return forbidden

    const category = findCategory(String(params['id']))
    if (!category) return notFound('category')

    const parsed = await parseBody(request, categorySchema)
    if (!parsed.ok) return parsed.response

    if (findDuplicateName(parsed.data.name, category.id)) {
      return errorResponse(422, 'Some of the details are not valid.', {
        name: 'A category with this name already exists',
      })
    }

    category.name = parsed.data.name
    category.description = parsed.data.description
    touch(category, nowIso())

    return HttpResponse.json(category)
  }),

  http.delete(`${RESOURCE}/:id`, async ({ request, params }) => {
    const failure = await preflight(request)
    if (failure) return failure
    const auth = requireAuth(request)
    if (!auth.ok) return auth.response
    const forbidden = requirePermission(auth.user, 'delete')
    if (forbidden) return forbidden

    const id = String(params['id'])
    const category = findCategory(id)
    if (!category) return notFound('category')

    /*
     * Referential integrity, with an explanation rather than a bare 409. Deleting a category
     * out from under its tickets would orphan them; the client turns this into an actionable
     * message.
     */
    const ticketCount = dependentTicketCount(id)
    if (ticketCount > 0) {
      return errorResponse(
        409,
        `“${category.name}” still has ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}. ` +
          'Move or delete them before deleting this category.',
      )
    }

    db.categories = db.categories.filter((candidate) => candidate.id !== id)
    syncDerivedCounts()

    return new HttpResponse(null, { status: 204 })
  }),
]
