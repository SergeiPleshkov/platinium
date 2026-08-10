import { http as mswHttp, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { createResource, serialiseListQuery } from '@/shared/api/createResource'
import { configureHttp, resetHttpConfig } from '@/shared/api/http'
import { createListQuery } from '@/shared/types/api'

const ORIGIN = 'http://localhost'

interface Widget {
  id: string
  name: string
}

const widgets = createResource<Widget, { name: string }>('/widgets')

beforeEach(() => {
  configureHttp({ baseUrl: `${ORIGIN}/api`, getAuthToken: () => 'test-token' })
})

afterEach(() => {
  resetHttpConfig()
})

describe('serialiseListQuery', () => {
  it('flattens filters to top-level params so the URL stays shareable', () => {
    const query = createListQuery({
      search: 'gala',
      sort: 'name',
      order: 'asc',
      page: 2,
      perPage: 25,
      filters: { status: ['draft', 'paused'], eventId: 'evt_001' },
    })

    expect(serialiseListQuery(query)).toEqual({
      search: 'gala',
      sort: 'name',
      order: 'asc',
      page: 2,
      perPage: 25,
      status: ['draft', 'paused'],
      eventId: 'evt_001',
    })
  })

  it('cannot let a filter shadow a reserved param', () => {
    const query = createListQuery({ page: 3, filters: { page: '99' } })

    // Reserved keys are spread last, so pagination cannot be hijacked by a filter name.
    expect(serialiseListQuery(query).page).toBe(3)
  })
})

describe('createResource', () => {
  it('requests the list with the serialised query', async () => {
    let seenUrl = ''
    server.use(
      mswHttp.get(`${ORIGIN}/api/widgets`, ({ request }) => {
        seenUrl = request.url
        return HttpResponse.json({
          data: [{ id: 'w1', name: 'One' }],
          meta: { total: 1, page: 1, perPage: 10, totalPages: 1 },
        })
      }),
    )

    const result = await widgets.list(
      createListQuery({ search: 'one', filters: { status: ['draft'] } }),
    )

    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(seenUrl).toContain('search=one')
    expect(seenUrl).toContain('status=draft')
  })

  it('reads, creates, updates and deletes at the right paths and methods', async () => {
    const calls: string[] = []
    server.use(
      mswHttp.get(`${ORIGIN}/api/widgets/:id`, ({ params }) => {
        calls.push(`GET ${String(params['id'])}`)
        return HttpResponse.json({ id: 'w1', name: 'One' })
      }),
      mswHttp.post(`${ORIGIN}/api/widgets`, () => {
        calls.push('POST')
        return HttpResponse.json({ id: 'w2', name: 'Two' }, { status: 201 })
      }),
      mswHttp.patch(`${ORIGIN}/api/widgets/:id`, ({ params }) => {
        calls.push(`PATCH ${String(params['id'])}`)
        return HttpResponse.json({ id: 'w1', name: 'Renamed' })
      }),
      mswHttp.delete(`${ORIGIN}/api/widgets/:id`, ({ params }) => {
        calls.push(`DELETE ${String(params['id'])}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    expect((await widgets.get('w1')).name).toBe('One')
    expect((await widgets.create({ name: 'Two' })).id).toBe('w2')
    expect((await widgets.update('w1', { name: 'Renamed' })).name).toBe('Renamed')
    await expect(widgets.remove('w1')).resolves.toBeUndefined()

    expect(calls).toEqual(['GET w1', 'POST', 'PATCH w1', 'DELETE w1'])
  })

  it('encodes an id that would otherwise change the path', async () => {
    let seenPath = ''
    server.use(
      mswHttp.get(`${ORIGIN}/api/widgets/:id`, ({ request }) => {
        seenPath = new URL(request.url).pathname
        return HttpResponse.json({ id: 'x', name: 'x' })
      }),
    )

    await widgets.get('a/b')

    expect(seenPath).toBe('/api/widgets/a%2Fb')
  })

  it('propagates a caller-supplied abort signal', async () => {
    server.use(
      mswHttp.get(`${ORIGIN}/api/widgets`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, perPage: 10, totalPages: 1 },
        })
      }),
    )

    const controller = new AbortController()
    const pending = widgets.list(createListQuery(), { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })
})
