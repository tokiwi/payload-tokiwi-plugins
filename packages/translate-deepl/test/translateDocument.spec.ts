import type { FlattenedBlock, FlattenedField, Payload, PayloadRequest } from 'payload'

import { ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedPluginConfig } from '../src/types'

import { DEFAULT_SKIP_FIELD_NAMES } from '../src/constants'
import { slugifyPath } from '../src/slugify'
import { DeeplClient, DeeplError } from '../src/deepl'
import { translateDocument } from '../src/translateDocument'

// A fake `payload` built entirely from spies, no booted instance and no database.
// The DeepL client is real but driven by a stubbed fetch, so the batching and the
// tag round-trip are exercised too.

const text = (name: string, localized = false): FlattenedField =>
  ({ localized, name, type: 'text' }) as FlattenedField
const richText = (name: string, localized = true): FlattenedField =>
  ({ localized, name, type: 'richText' }) as FlattenedField

const blocksField = (name: string, ...refs: string[]): FlattenedField =>
  ({ blockReferences: refs, blocks: [], name, type: 'blocks' }) as unknown as FlattenedField

const block = (slug: string, fields: FlattenedField[]): FlattenedBlock =>
  ({
    fields,
    flattenedFields: [text('id'), text('blockName'), ...fields],
    slug,
  }) as unknown as FlattenedBlock

const pageFields: FlattenedField[] = [
  text('title', true),
  text('slug', true),
  text('type'),
  blocksField('blockBuilder', 'content'),
]

const lexical = (...runs: { format?: number; text: string }[]) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: runs.map((run) => ({
          type: 'text',
          format: run.format ?? 0,
          text: run.text,
          version: 1,
        })),
      },
    ],
  },
})

const config: ResolvedPluginConfig = {
  apiBase: 'https://api-free.deepl.com',
  apiKey: 'key:fx',
  budgetMs: 90_000,
  bulkBudgetMs: 300_000,
  collections: ['pages'],
  maxDocuments: 25,
  localeMap: { en: { source: 'EN', target: 'EN-GB' }, fr: { source: 'FR', target: 'FR' } },
  isPlaceholderSlug: (slug) =>
    typeof slug !== 'string' || !slug.trim() || /^untitled(-\d+)?$/i.test(slug),
  normalizeSlug: slugifyPath,
  skipFieldNames: new Set(DEFAULT_SKIP_FIELD_NAMES),
  slugFieldNames: new Set(['slug']),
  slugMode: 'translate',
}

type Doc = Record<string, unknown>

const sourceDoc = (): Doc => ({
  _status: 'published',
  blockBuilder: [
    {
      blockName: 'Intro',
      blockType: 'content',
      id: 'c-1',
      richText: lexical({ text: 'Nous utilisons des ' }, { format: 1, text: 'méthodes' }),
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 42,
  slug: 'a-propos',
  title: 'À propos',
  type: 'default',
  updatedAt: '2026-02-01T00:00:00.000Z',
})

/** Same structural spine, but no English text yet: a `fallbackLocale: false` read. */
const emptyTargetDoc = (): Doc => ({
  ...sourceDoc(),
  blockBuilder: [{ blockName: 'Intro', blockType: 'content', id: 'c-1', richText: null }],
  slug: null,
  title: null,
})

let count: ReturnType<typeof vi.fn>
let findByID: ReturnType<typeof vi.fn>
let update: ReturnType<typeof vi.fn>
let fetchImpl: ReturnType<typeof vi.fn>
/** `pages` keeps drafts, like the real one. Set to `undefined` for a collection that does not. */
let versions: unknown

/** A spy's call, by index. Every site here reads a call the test just caused, so it exists. */
const callArgs = (spy: ReturnType<typeof vi.fn>, index = 0) => spy.mock.calls[index]![0]

const makeReq = (): PayloadRequest =>
  ({
    payload: {
      blocks: { content: block('content', [richText('richText')]) },
      collections: { pages: { config: { flattenedFields: pageFields, versions } } },
      count,
      findByID,
      update,
    } as unknown as Payload,
    user: { collection: 'users', email: 'editor@example.test', id: 1 },
  }) as unknown as PayloadRequest

const createClient = () =>
  new DeeplClient({
    apiBase: 'https://api-free.deepl.com',
    apiKey: 'key:fx',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => undefined,
  })

/** Answers any batch by prefixing every text, preserving tags when they are used. */
const echoTranslator = () =>
  vi.fn(async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as RequestInit).body as string) as {
      tag_handling?: string
      text: string[]
    }
    const out = body.text.map((entry) =>
      body.tag_handling === 'xml'
        ? entry.replace(/>([^<]*)</g, (_match, inner: string) => `>EN:${inner}<`)
        : `EN:${entry}`,
    )
    return new Response(JSON.stringify({ translations: out.map((entry) => ({ text: entry })) }), {
      status: 200,
    })
  })

const run = (overrides: Partial<Parameters<typeof translateDocument>[0]> = {}) =>
  translateDocument({
    collection: 'pages',
    config,
    createClient,
    id: 42,
    overwrite: false,
    req: makeReq(),
    sourceLocale: 'fr',
    targetLocale: 'en',
    ...overrides,
  })

beforeEach(() => {
  fetchImpl = echoTranslator()
  versions = { drafts: true }
  // The document has a published version, which is what earns the translation a
  // publish of its own.
  count = vi.fn(async () => ({ totalDocs: 1 }))
  update = vi.fn(async () => ({ id: 42 }))
  findByID = vi.fn(async ({ locale }: { locale: string }) =>
    locale === 'fr' ? sourceDoc() : emptyTargetDoc(),
  )
})

describe('reading both locales', () => {
  it('disables the locale fallback on every read', async () => {
    await run()

    // Payload treats an omitted *or* null fallback as "use the configured one",
    // and this project leaves it on: without `false`, reading the English locale
    // hands back the French text and the translation becomes a no-op round trip.
    for (const call of findByID.mock.calls) {
      expect(call[0].fallbackLocale).toBe(false)
    }
    expect(findByID.mock.calls.map((call) => call[0].locale)).toEqual(['fr', 'en'])
  })

  it('reads the saved draft, at depth 0, under the caller’s permissions', async () => {
    await run()
    expect(callArgs(findByID)).toMatchObject({
      collection: 'pages',
      depth: 0,
      draft: true,
      id: 42,
      overrideAccess: false,
      trash: true,
    })
  })

  it('marks every read with the plugin context, so a consumer hook can stand aside', async () => {
    await run()
    for (const call of findByID.mock.calls) {
      expect(call[0].context).toMatchObject({ deeplTranslate: true })
    }
  })
})

describe('writing the target locale', () => {
  it('publishes the target locale of a document that is already published', async () => {
    const result = await run()

    const args = callArgs(update)
    expect(args).toMatchObject({
      collection: 'pages',
      depth: 0,
      draft: false,
      id: 42,
      locale: 'en',
      overrideAccess: false,
      // Only this locale: Payload merges the write into the last published version
      // for `en` alone, so unpublished French work stays unpublished.
      publishSpecificLocale: 'en',
    })
    // `isSavingDraft` is false as soon as the data says 'published'. That is what
    // makes this a publish rather than one more draft version.
    expect(args.data._status).toBe('published')
    expect(result.published).toBe(true)
    // And the decision is the plugin's, read from the published state in the main
    // table, never the source document's own `_status`.
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ id: { equals: 42 } }, { _status: { equals: 'published' } }] },
      }),
    )
  })

  it('saves a draft when the document has never been published', async () => {
    count = vi.fn(async () => ({ totalDocs: 0 }))

    const result = await run()

    const args = callArgs(update)
    expect(args.draft).toBe(true)
    expect(args.publishSpecificLocale).toBeUndefined()
    // Round-tripping the source document's own 'published' would turn `draft: true`
    // into a no-op and put an unreviewed page on the site.
    expect(args.data._status).toBeUndefined()
    expect(result.published).toBe(false)
  })

  it('leaves a collection without drafts alone, where the write is live anyway', async () => {
    versions = undefined

    const result = await run()

    expect(count).not.toHaveBeenCalled()
    expect(callArgs(update).data._status).toBeUndefined()
    expect(result.published).toBe(false)
  })

  it('strips the keys Payload manages itself', async () => {
    await run()
    const { data } = callArgs(update)
    expect(data.id).toBeUndefined()
    expect(data.createdAt).toBeUndefined()
    expect(data.updatedAt).toBeUndefined()
  })

  it('translates the title and the rich text runs', async () => {
    await run()
    const { data } = callArgs(update)

    expect(data.title).toBe('EN:À propos')
    const runs = data.blockBuilder[0].richText.root.children[0].children
    expect(runs.map((node: { text: string }) => node.text)).toEqual([
      'EN:Nous utilisons des ',
      'EN:méthodes',
    ])
    // The bold run keeps its format bit.
    expect(runs[1].format).toBe(1)
  })

  it('keeps every block row id and blockType', async () => {
    await run()
    const { data } = callArgs(update)
    expect(data.blockBuilder[0]).toMatchObject({
      blockName: 'Intro',
      blockType: 'content',
      id: 'c-1',
    })
  })

  it('carries non-localized fields across untouched', async () => {
    await run()
    expect(callArgs(update).data.type).toBe('default')
  })

  it('translates every entry of a hasMany field, whatever the target locale holds', async () => {
    // The target array is shorter than the source. Paths come from the source walk,
    // so every index must still be written.
    const hasManyFields = [
      { hasMany: true, localized: true, name: 'tags', type: 'text' },
    ] as unknown as FlattenedField[]

    findByID = vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? { id: 42, tags: ['un', 'deux', 'trois'] } : { id: 42, tags: ['one'] },
    )

    const req = {
      payload: {
        blocks: {},
        collections: { pages: { config: { flattenedFields: hasManyFields, versions } } },
        count,
        findByID,
        update,
      } as unknown as Payload,
      user: { collection: 'users', email: 'editor@example.test', id: 1 },
    } as unknown as PayloadRequest

    const result = await run({ overwrite: true, req })
    expect(result.translated).toBe(3)
    expect(callArgs(update).data.tags).toEqual(['EN:un', 'EN:deux', 'EN:trois'])
  })
})

describe('slug handling', () => {
  // A slug is a live URL, so the rule is narrower than for other fields: replace
  // it only when the target locale has nothing real there.
  const withTargetSlug = (slug: null | string) =>
    vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? sourceDoc() : { ...emptyTargetDoc(), slug },
    )

  it('translates the slug and normalises the answer when the target has none', async () => {
    await run()
    // DeepL answers a slug with prose, so 'EN:a-propos' is slugified rather than
    // written through.
    expect(callArgs(update).data.slug).toBe('en-a-propos')
  })

  it('keeps a slug the editor deliberately set', async () => {
    findByID = withTargetSlug('about-us/management')
    const result = await run()

    expect(callArgs(update).data.slug).toBe('about-us/management')
    expect(result.skipped).toBeGreaterThan(0)
  })

  it('replaces a backfill placeholder, which reads as "set" to the database', async () => {
    // The shape a backfill leaves behind to satisfy a required, unique column.
    findByID = withTargetSlug('untitled-87')
    await run()
    expect(callArgs(update).data.slug).toBe('en-a-propos')
  })

  it('replaces a deliberate slug only when overwrite is ticked', async () => {
    findByID = withTargetSlug('about-us/management')
    await run({ overwrite: true })
    expect(callArgs(update).data.slug).toBe('en-a-propos')
  })

  it('preserves path depth through the translation', async () => {
    findByID = vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? { ...sourceDoc(), slug: 'about-us/management' } : emptyTargetDoc(),
    )
    await run()
    expect(callArgs(update).data.slug).toBe('en-about-us/management')
  })

  it('omits the slug under preserve-or-derive, so the collection derives it', async () => {
    await run({ config: { ...config, slugMode: 'preserve-or-derive' } })
    expect('slug' in callArgs(update).data).toBe(false)
  })

  it('copies the source slug when asked to', async () => {
    await run({ config: { ...config, slugMode: 'copy' } })
    expect(callArgs(update).data.slug).toBe('a-propos')
  })

  it('unsets a slug whose translation normalises to nothing', async () => {
    // DeepL can answer a short slug with punctuation only, and an empty string in a
    // required, unique column is a validation failure, not a slug.
    fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as RequestInit).body as string) as { text: string[] }
      const out = body.text.map((entry) => (entry === 'a-propos' ? '...' : `EN:${entry}`))
      return new Response(JSON.stringify({ translations: out.map((text) => ({ text })) }), {
        status: 200,
      })
    })

    const result = await run()
    expect(result.ok).toBe(true)
    expect(callArgs(update).data).not.toHaveProperty('slug')
  })
})

describe('existing translations', () => {
  const partlyTranslated = () => ({
    ...emptyTargetDoc(),
    title: 'About us',
  })

  it('leaves a filled target value alone and reports it as skipped', async () => {
    findByID = vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? sourceDoc() : partlyTranslated(),
    )

    const result = await run()
    expect(callArgs(update).data.title).toBe('About us')
    expect(result.skipped).toBe(1)
  })

  it('replaces it when overwrite is on', async () => {
    findByID = vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? sourceDoc() : partlyTranslated(),
    )

    const result = await run({ overwrite: true })
    expect(callArgs(update).data.title).toBe('EN:À propos')
    expect(result.skipped).toBe(0)
  })
})

describe('failure handling', () => {
  it('refuses a locale with no DeepL language rather than guessing one', async () => {
    // `config.localeMap` holds fr and en. A consumer that adds a locale and forgets
    // the map must hear about it, not get the source text written back.
    await expect(run({ targetLocale: 'de' })).rejects.toMatchObject({
      fatal: true,
      message: expect.stringContaining('"de"'),
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('writes nothing when the quota is exhausted', async () => {
    fetchImpl = vi.fn(async () => new Response('quota', { status: 456 }))

    await expect(run()).rejects.toBeInstanceOf(DeeplError)
    expect(update).not.toHaveBeenCalled()
  })

  it('falls back run by run when the tags do not come back intact', async () => {
    fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as RequestInit).body as string) as {
        tag_handling?: string
        text: string[]
      }
      const out = body.text.map((entry) =>
        body.tag_handling === 'xml' ? 'DeepL lost the tags' : `EN:${entry}`,
      )
      return new Response(JSON.stringify({ translations: out.map((text) => ({ text })) }), {
        status: 200,
      })
    })

    const result = await run()

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.reason).toMatch(/formatting could not be preserved/)
    const runs = callArgs(update).data.blockBuilder[0].richText.root.children[0].children
    // The paragraph is still translated, just one run at a time.
    expect(runs.map((node: { text: string }) => node.text)).toEqual([
      'EN:Nous utilisons des ',
      'EN:méthodes',
    ])
  })

  it('keeps the translation as a draft when publishing fails validation', async () => {
    // Publishing validates the whole document. The draft write does not. Losing a
    // finished run to a slug another page already holds would be the worst of both.
    update = vi.fn(async ({ draft }: { draft: boolean }) => {
      if (!draft) {
        throw new ValidationError({
          collection: 'pages',
          errors: [{ message: 'Slug taken', path: 'slug' }],
        })
      }
      return { id: 42 }
    })

    const result = await run()

    expect(update).toHaveBeenCalledTimes(2)
    expect(callArgs(update, 1).draft).toBe(true)
    expect(callArgs(update, 1).data._status).toBeUndefined()
    expect(result).toMatchObject({ ok: true, published: false })
    expect(result.warnings.at(-1)?.reason).toMatch(/saved as a draft/)
  })

  it('reports a ValidationError the draft write cannot avoid either', async () => {
    update = vi.fn(async () => {
      throw new ValidationError({
        collection: 'pages',
        errors: [{ message: 'Slug taken', path: 'slug' }],
      })
    })

    await expect(run()).rejects.toBeInstanceOf(ValidationError)
  })

  it('stops batching once the time budget is spent', async () => {
    let clock = 0
    const now = () => {
      clock += 200_000
      return clock
    }

    const result = await run({ now })
    expect(result.partial).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
    // Nothing translated means nothing saved: a verbatim copy of the source
    // locale is not an acceptable consolation prize.
    expect(update).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it('saves nothing and reports success when everything was already translated', async () => {
    findByID = vi.fn(async ({ locale }: { locale: string }) =>
      locale === 'fr' ? sourceDoc() : { ...sourceDoc(), slug: 'about', title: 'About us' },
    )

    const result = await run()
    expect(result).toMatchObject({ ok: true, translated: 0 })
    expect(update).not.toHaveBeenCalled()
  })
})
