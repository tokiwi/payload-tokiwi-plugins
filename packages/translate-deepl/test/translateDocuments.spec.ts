import type { FlattenedBlock, FlattenedField, Payload, PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedPluginConfig } from '../src/types'

import { DEFAULT_SKIP_FIELD_NAMES } from '../src/constants'
import { slugifyPath } from '../src/slugify'
import { DeeplClient } from '../src/deepl'
import { TooManyDocumentsError, translateDocuments } from '../src/translateDocuments'

// Bulk orchestration against a fake `payload` of spies. No database, no network:
// the DeepL client is real but driven by a stubbed fetch.

const text = (name: string, localized = false): FlattenedField =>
  ({ localized, name, type: 'text' }) as FlattenedField

const pageFields: FlattenedField[] = [text('title', true), text('slug', true)]

const config: ResolvedPluginConfig = {
  apiBase: 'https://api-free.deepl.com',
  apiKey: 'key:fx',
  budgetMs: 90_000,
  bulkBudgetMs: 300_000,
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

const sourceDoc = (id: number) => ({ id, slug: `page-${id}`, title: `Titre ${id}` })
const targetDoc = (id: number) => ({ id, slug: null, title: null })

let find: ReturnType<typeof vi.fn>
let findByID: ReturnType<typeof vi.fn>
let update: ReturnType<typeof vi.fn>
let fetchImpl: ReturnType<typeof vi.fn>

/** A spy's call, by index. Every site here reads a call the test just caused, so it exists. */
const callArgs = (spy: ReturnType<typeof vi.fn>, index = 0) => spy.mock.calls[index]![0]

const makeReq = (): PayloadRequest =>
  ({
    payload: {
      blocks: {} as Record<string, FlattenedBlock>,
      collections: {
        pages: { config: { admin: { useAsTitle: 'title' }, flattenedFields: pageFields } },
      },
      find,
      findByID,
      update,
    } as unknown as Payload,
    user: { collection: 'users', id: 1 },
  }) as unknown as PayloadRequest

const createClient = () =>
  new DeeplClient({
    apiBase: 'https://api-free.deepl.com',
    apiKey: 'key:fx',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => undefined,
  })

const run = (overrides: Partial<Parameters<typeof translateDocuments>[0]> = {}) =>
  translateDocuments({
    collection: 'pages',
    config,
    createClient,
    overwrite: false,
    req: makeReq(),
    sourceLocale: 'fr',
    targetLocale: 'en',
    where: { id: { in: [1, 2] } },
    ...overrides,
  })

beforeEach(() => {
  fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as RequestInit).body as string) as { text: string[] }
    return new Response(
      JSON.stringify({ translations: body.text.map((t) => ({ text: `EN:${t}` })) }),
      { status: 200 },
    )
  })
  update = vi.fn(async ({ id }: { id: number }) => ({ id }))
  findByID = vi.fn(async ({ id, locale }: { id: number; locale: string }) =>
    locale === 'fr' ? sourceDoc(id) : targetDoc(id),
  )
  find = vi.fn(async () => ({ docs: [sourceDoc(1), sourceDoc(2)] }))
})

describe('resolving the selection', () => {
  it('passes the admin’s where straight through, under the caller’s permissions', async () => {
    await run({ where: { id: { in: [1, 2] } } })

    expect(callArgs(find)).toMatchObject({
      collection: 'pages',
      depth: 0,
      overrideAccess: false,
      where: { id: { in: [1, 2] } },
    })
  })

  it('sets no limit by default, so a selection of any size is translated', async () => {
    find = vi.fn(async () => ({ docs: [1, 2, 3, 4, 5, 6].map(sourceDoc) }))

    const result = await run()
    expect(callArgs(find).limit).toBeUndefined()
    expect(callArgs(find).pagination).toBe(false)
    expect(result.documentsTranslated).toBe(6)
  })

  it('fetches only the id and the title column, whatever the selection size', async () => {
    await run()
    expect(callArgs(find).select).toEqual({ id: true, title: true })
  })

  it('refuses an oversized selection only when a cap is configured', async () => {
    find = vi.fn(async () => ({ docs: [1, 2, 3, 4].map(sourceDoc) }))
    const capped = { config: { ...config, maxDocuments: 3 } }

    await expect(run(capped)).rejects.toBeInstanceOf(TooManyDocumentsError)
    await expect(run(capped)).rejects.toThrow(/Selected 4 documents.*at most 3/)
    expect(update).not.toHaveBeenCalled()
  })

  it('handles an empty selection without calling DeepL', async () => {
    find = vi.fn(async () => ({ docs: [] }))

    const result = await run()
    expect(result).toMatchObject({ documentsTranslated: 0, ok: true, requested: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('translating the selection', () => {
  it('translates every document and totals the values written', async () => {
    const result = await run()

    expect(result).toMatchObject({
      documentsFailed: 0,
      documentsTranslated: 2,
      ok: true,
      partial: false,
      requested: 2,
      // Two values per document: the title, and the slug, which the fixture's
      // target locale leaves empty.
      translated: 4,
    })
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls.map((call) => call[0].id)).toEqual([1, 2])
    expect(callArgs(update).data.title).toBe('EN:Titre 1')
    expect(callArgs(update).data.slug).toBe('en-page-1')
  })

  it('reports each document as it finishes, with its position and the total', async () => {
    const events: { index: number; title?: string; total: number }[] = []
    await run({
      onProgress: ({ document, index, total }) => {
        events.push({ index, title: document.title, total })
      },
    })

    // One call per document, in order, each carrying the total the bar needs.
    expect(events).toEqual([
      { index: 0, title: 'Titre 1', total: 2 },
      { index: 1, title: 'Titre 2', total: 2 },
    ])
  })

  it('reports a document that failed, so the bar keeps moving', async () => {
    update = vi.fn(async ({ id }: { id: number }) => {
      if (id === 1) throw new Error('nope')
      return { id }
    })
    const seen: boolean[] = []
    await run({ onProgress: ({ document }) => seen.push(document.ok) })

    expect(seen).toEqual([false, true])
  })

  it('labels each result with useAsTitle so the toast can name it', async () => {
    const result = await run()
    expect(result.results.map((entry) => entry.title)).toEqual(['Titre 1', 'Titre 2'])
  })

  it('ignores a useAsTitle whose value is not a string, so no toast prints an object', async () => {
    // A localized `useAsTitle` read at the request's locale can come back as an
    // object, or as null where the locale has nothing. `find` is the module-level
    // spy the file's own `beforeEach` assigns, not a property of a `payload` object.
    find.mockResolvedValueOnce({ docs: [{ id: 1, title: { fr: 'Accueil' } }] })
    const result = await run()
    expect(result.results[0]?.title).toBeUndefined()
  })

  it('shares one deadline across documents rather than giving each a fresh budget', async () => {
    // 200s per call: inside the 300s bulk budget for the first document, past it
    // for the second. A per-document budget would have let both through.
    let clock = 0
    const now = () => {
      clock += 200_000
      return clock
    }

    const result = await run({ now })
    expect(result.partial).toBe(true)
    expect(result.documentsTranslated).toBeLessThan(2)
    expect(result.results.some((entry) => entry.error?.includes('Ran out of time'))).toBe(true)
  })
})

describe('failure handling', () => {
  it('keeps going when one document fails, and reports which', async () => {
    update = vi.fn(async ({ id }: { id: number }) => {
      if (id === 1) throw new Error('Slug taken')
      return { id }
    })

    const result = await run()
    expect(result).toMatchObject({ documentsFailed: 1, documentsTranslated: 1, ok: true })
    expect(result.results[0]).toMatchObject({ error: 'Slug taken', id: 1, ok: false })
    expect(result.results[1]).toMatchObject({ id: 2, ok: true })
  })

  it('stops at the first fatal DeepL error instead of burning the quota twice', async () => {
    fetchImpl = vi.fn(async () => new Response('quota', { status: 456 }))

    const result = await run()
    expect(result.ok).toBe(false)
    expect(result.partial).toBe(true)
    // One document attempted, then the run stops: the second is never tried.
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.error).toMatch(/quota/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('reports failure when no document could be translated', async () => {
    update = vi.fn(async () => {
      throw new Error('nope')
    })

    const result = await run()
    expect(result).toMatchObject({ documentsTranslated: 0, ok: false })
  })
})
