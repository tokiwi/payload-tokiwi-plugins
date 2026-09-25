import type { FlattenedField, Payload, PayloadRequest } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BulkProgressEvent, ResolvedPluginConfig } from '../src/types'

import { DEFAULT_SKIP_FIELD_NAMES } from '../src/constants'
import { slugifyPath } from '../src/slugify'
import { buildTranslateEndpoints } from '../src/endpoint'
import { readNdjson } from '../src/ndjson'

// Drives the real endpoint handler with a fake `payload` and a stubbed global
// fetch, so the streaming contract is exercised end to end without a server.

const text = (name: string, localized = false): FlattenedField =>
  ({ localized, name, type: 'text' }) as FlattenedField

const config: ResolvedPluginConfig = {
  apiBase: 'https://api-free.deepl.com',
  apiKey: 'key:fx',
  budgetMs: 90_000,
  bulkBudgetMs: 1_800_000,
  collections: ['pages'],
  localeMap: { en: { source: 'EN', target: 'EN-GB' }, fr: { source: 'FR', target: 'FR' } },
  maxDocuments: 0,
  isPlaceholderSlug: (slug) =>
    typeof slug !== 'string' || !slug.trim() || /^untitled(-\d+)?$/i.test(slug),
  normalizeSlug: slugifyPath,
  skipFieldNames: new Set(DEFAULT_SKIP_FIELD_NAMES),
  slugFieldNames: new Set(['slug']),
  slugMode: 'translate',
}

// `buildTranslateEndpoints` always returns exactly two entries: single first, bulk second.
const bulkEndpoint = buildTranslateEndpoints(config)[1]!

let docIds: number[]
let gate: (() => void) | undefined

// `addDataAndFileToRequest` reads `method`, `body`, `headers` and `text()`, so the
// fake request is a real one with the Payload extras hung off it.
const makeReq = (): PayloadRequest =>
  Object.assign(
    new Request('http://localhost/api/deepl-translate/pages', {
      body: JSON.stringify({ overwrite: true, sourceLocale: 'fr', targetLocale: 'en' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    {
      payload: {
        blocks: {},
        collections: {
          pages: {
            config: { admin: { useAsTitle: 'title' }, flattenedFields: [text('title', true)] },
          },
        },
        config: { localization: { localeCodes: ['fr', 'en'] } },
        find: async () => ({ docs: docIds.map((id) => ({ id, title: `Titre ${id}` })) }),
        findByID: async ({ id, locale }: { id: number; locale: string }) =>
          locale === 'fr' ? { id, title: `Titre ${id}` } : { id, title: null },
        update: async ({ id }: { id: number }) => ({ id }),
      } as unknown as Payload,
      query: { where: { id: { in: docIds } } },
      routeParams: { collection: 'pages' },
      user: { collection: 'users', id: 1 },
    },
  ) as unknown as PayloadRequest

beforeEach(() => {
  docIds = [1, 2]
  gate = undefined

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string[] }
      // The second document waits for the test to say it has already seen the
      // first one's line. If the response were buffered, this would deadlock.
      if (body.text[0]?.includes('2') && gate) {
        await new Promise<void>((resolve) => {
          const release = gate
          gate = undefined
          release?.()
          setTimeout(resolve, 0)
        })
      }
      return new Response(
        JSON.stringify({ translations: body.text.map((entry) => ({ text: `EN:${entry}` })) }),
        { status: 200 },
      )
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const drain = async (response: Response) => {
  const events: BulkProgressEvent[] = []
  await readNdjson<BulkProgressEvent>(response.body!, (event) => events.push(event))
  return events
}

describe('the bulk endpoint', () => {
  it('answers with an ndjson stream rather than a single object', async () => {
    const response = (await bulkEndpoint.handler(makeReq())) as Response

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    // Proxies buffer a stream by default, which would defeat the whole point.
    expect(response.headers.get('x-accel-buffering')).toBe('no')
  })

  it('emits start, one line per document, then done', async () => {
    const events = await drain((await bulkEndpoint.handler(makeReq())) as Response)

    expect(events.map((event) => event.type)).toEqual(['start', 'document', 'document', 'done'])
    expect(events[0]).toEqual({ total: 2, type: 'start' })
    expect(events[1]).toMatchObject({ index: 0, total: 2 })
    expect((events[1] as { document: { title: string } }).document.title).toBe('Titre 1')
    expect(events[3]).toMatchObject({ documentsTranslated: 2, ok: true, requested: 2 })
  })

  it('delivers a document line before the run has finished', async () => {
    // The stub for document 2 blocks until this resolves, so reading its line
    // early is only possible if the response really streams.
    const sawFirst = new Promise<void>((resolve) => {
      gate = resolve
    })

    const response = (await bulkEndpoint.handler(makeReq())) as Response
    const seen: BulkProgressEvent[] = []

    const reading = readNdjson<BulkProgressEvent>(response.body!, (event) => {
      seen.push(event)
    })

    await sawFirst
    expect(seen.some((event) => event.type === 'document')).toBe(true)
    expect(seen.some((event) => event.type === 'done')).toBe(false)

    await reading
    expect(seen[seen.length - 1]?.type).toBe('done')
  })

  it('handles a selection far larger than the old 25-document cap', async () => {
    docIds = Array.from({ length: 120 }, (_, index) => index + 1)

    const events = await drain((await bulkEndpoint.handler(makeReq())) as Response)
    const done = events[events.length - 1] as { documentsTranslated: number; requested: number }

    expect(events.filter((event) => event.type === 'document')).toHaveLength(120)
    expect(done).toMatchObject({ documentsTranslated: 120, requested: 120 })
  })

  it('reports a pre-stream failure as an ordinary error, not a stream', async () => {
    const req = makeReq()
    ;(req as unknown as { query: unknown }).query = {}

    await expect(bulkEndpoint.handler(req)).rejects.toThrow(/No documents selected/)
  })
})

describe('the single-document endpoint', () => {
  // `buildTranslateEndpoints` always returns exactly two entries: single first, bulk second.
  const singleEndpoint = buildTranslateEndpoints(config)[0]!

  /** The same fake payload as the bulk cases, re-pointed at one document. */
  const singleReq = (
    overrides: { payload?: Record<string, unknown>; targetLocale?: string } = {},
  ): PayloadRequest => {
    const base = makeReq() as unknown as { payload: Payload }
    return Object.assign(
      new Request('http://localhost/api/translate/deepl/pages/1', {
        body: JSON.stringify({
          overwrite: true,
          sourceLocale: 'fr',
          targetLocale: overrides.targetLocale ?? 'en',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      {
        payload: { ...base.payload, ...overrides.payload } as unknown as Payload,
        routeParams: { collection: 'pages', id: '1' },
        user: { collection: 'users', id: 1 },
      },
    ) as unknown as PayloadRequest
  }

  it('lets a missing document answer with Payload’s own error, not a 500', async () => {
    // Anything that is not a ValidationError, a TooManyDocumentsError or a
    // DeeplError is rethrown untouched, so Payload's own handler sets the status.
    const notFound = Object.assign(new Error('Not Found'), { status: 404 })
    const req = singleReq({
      payload: {
        findByID: async () => {
          throw notFound
        },
      },
    })

    await expect(singleEndpoint.handler(req)).rejects.toBe(notFound)
  })

  it('reports a locale Payload knows but the plugin cannot map as a 502', async () => {
    // `config.localeMap` holds fr and en only, so `de` passes validation and fails
    // where the language pair is resolved. That message is the one the editor needs.
    const req = singleReq({
      payload: { config: { localization: { localeCodes: ['fr', 'en', 'de'] } } },
      targetLocale: 'de',
    })

    await expect(singleEndpoint.handler(req)).rejects.toMatchObject({
      message: expect.stringContaining('"de"'),
      status: 502,
    })
  })
})
