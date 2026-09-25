import type { FlattenedBlock, FlattenedField, Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import { collectLocalizedLeaves } from '../src/collect'
import { DEFAULT_SKIP_FIELD_NAMES } from '../src/constants'
import { setAtPath, unsetAtPath } from '../src/path'

// The walker only reads `payload.blocks` and
// `payload.collections[*].config.flattenedFields`, so both are built by hand: no
// database, and each fixture names the schema shape its assertions are about.

type Loc = { localized?: boolean }

const text = (name: string, opts: Loc = {}): FlattenedField =>
  ({ name, type: 'text', ...opts }) as FlattenedField
const textarea = (name: string, opts: Loc = {}): FlattenedField =>
  ({ name, type: 'textarea', ...opts }) as FlattenedField
const richText = (name: string, opts: Loc = {}): FlattenedField =>
  ({ name, type: 'richText', ...opts }) as FlattenedField

/** Payload injects both of these into every block row. Neither is prose. */
const baseBlockFields: FlattenedField[] = [text('id'), text('blockName')]

const blocksField = (name: string, ...refs: string[]): FlattenedField =>
  ({ name, type: 'blocks', blockReferences: refs, blocks: [] }) as unknown as FlattenedField

const arrayField = (name: string, fields: FlattenedField[], opts: Loc = {}): FlattenedField =>
  ({
    name,
    type: 'array',
    fields,
    flattenedFields: [text('id'), ...fields],
    ...opts,
  }) as unknown as FlattenedField

const block = (slug: string, fields: FlattenedField[]): FlattenedBlock =>
  ({ slug, fields, flattenedFields: [...baseBlockFields, ...fields] }) as unknown as FlattenedBlock

const blocks: Record<string, FlattenedBlock> = {
  // The block field itself is never localized, the leaves are.
  cardsGrid: block('cardsGrid', [
    text('title', { localized: true }),
    { name: 'columns', type: 'number' } as FlattenedField,
    arrayField('items', [
      text('title', { localized: true }),
      text('icon', { localized: true }),
      { name: 'image', type: 'upload', relationTo: 'media' } as FlattenedField,
    ]),
  ]),
  column: block('column', [blocksField('content', 'content', 'cardsGrid', 'localizedList')]),
  content: block('content', [richText('richText', { localized: true })]),
  // A localized array: its whole value is per-locale, so its children are not
  // individually localized even though their text still has to be translated.
  localizedList: block('localizedList', [
    arrayField('entries', [text('label'), textarea('body')], { localized: true }),
  ]),
  row: block('row', [blocksField('columns', 'column')]),
  section: block('section', [text('anchor'), text('anchorTitle'), blocksField('rows', 'row')]),
}

const pageFields: FlattenedField[] = [
  text('title', { localized: true }),
  text('slug', { localized: true }),
  { name: 'type', options: ['default'], type: 'select' } as FlattenedField,
  { localized: true, name: 'readingTime', type: 'number' } as FlattenedField,
  { name: 'related', relationTo: 'ctas', type: 'relationship' } as FlattenedField,
  blocksField('blockBuilder', 'section'),
  {
    name: 'meta',
    type: 'group',
    fields: [],
    flattenedFields: [
      text('title', { localized: true }),
      textarea('description', { localized: true }),
    ],
  } as unknown as FlattenedField,
]

const payload = {
  blocks,
  collections: {
    ctas: { config: { flattenedFields: [text('title', { localized: true })] } },
    pages: { config: { flattenedFields: pageFields } },
  },
} as unknown as Payload

const skipFieldNames = new Set(DEFAULT_SKIP_FIELD_NAMES)

const collect = (doc: Record<string, unknown>, collectionSlug = 'pages') =>
  collectLocalizedLeaves({ collectionSlug, doc, payload, skipFieldNames })

const paths = (doc: Record<string, unknown>) => collect(doc).map((leaf) => leaf.path.join('.'))

/** section -> row -> column -> content, the nesting a real page uses. */
const inColumn = (...content: Record<string, unknown>[]) => [
  {
    id: 'sec-1',
    anchor: 'our-team',
    anchorTitle: 'Our team',
    blockName: 'Hero',
    blockType: 'section',
    rows: [
      {
        id: 'row-1',
        blockType: 'row',
        columns: [{ id: 'col-1', blockType: 'column', content }],
      },
    ],
  },
]

describe('collectLocalizedLeaves', () => {
  it('descends a non-localized blocks field to reach a localized leaf', () => {
    const doc = {
      blockBuilder: inColumn({
        id: 'c-1',
        blockType: 'content',
        richText: { root: { children: [] } },
      }),
    }

    expect(paths(doc)).toEqual(['blockBuilder.0.rows.0.columns.0.content.0.richText'])
  })

  it('ignores non-localized siblings at every level', () => {
    const doc = {
      title: 'Contact',
      type: 'default',
      blockBuilder: inColumn({ id: 'c-1', blockType: 'cardsGrid', columns: 3, title: 'Équipe' }),
    }

    expect(paths(doc)).toEqual(['title', 'blockBuilder.0.rows.0.columns.0.content.0.title'])
  })

  it('collects the children of a localized array, whose value is itself per-locale', () => {
    const doc = {
      blockBuilder: inColumn({
        id: 'c-1',
        blockType: 'localizedList',
        entries: [{ id: 'e-1', body: 'Un corps', label: 'Une étiquette' }],
      }),
    }

    expect(paths(doc)).toEqual([
      'blockBuilder.0.rows.0.columns.0.content.0.entries.0.label',
      'blockBuilder.0.rows.0.columns.0.content.0.entries.0.body',
    ])
  })

  it('does not collect the children of a non-localized array', () => {
    const doc = {
      blockBuilder: inColumn({
        id: 'c-1',
        blockType: 'cardsGrid',
        items: [{ id: 'i-1', image: 4, title: 'Une carte' }],
      }),
    }

    // `title` is localized in its own right. `image` is not and is left alone.
    expect(paths(doc)).toEqual(['blockBuilder.0.rows.0.columns.0.content.0.items.0.title'])
  })

  it('resolves a block from the registry when the inline blocks array is empty', () => {
    // Every fixture block uses `blockReferences` with `blocks: []`, so reaching a
    // leaf at all proves the registry lookup works.
    const doc = { blockBuilder: inColumn({ id: 'c-1', blockType: 'content', richText: {} }) }
    expect(paths(doc)).toHaveLength(1)
  })

  it('skips a blockType that is no longer in the config instead of throwing', () => {
    const doc = {
      title: 'Contact',
      blockBuilder: inColumn({ id: 'c-1', blockType: 'blockRemovedLastYear', title: 'Orphelin' }),
    }
    expect(paths(doc)).toEqual(['title'])
  })

  it('reports a technical field but marks it untranslatable', () => {
    const doc = {
      slug: 'a-propos',
      blockBuilder: inColumn({
        id: 'c-1',
        blockType: 'cardsGrid',
        items: [{ icon: 'mdi:home', id: 'i-1', title: 'Une carte' }],
      }),
    }

    const testSkipFieldNames = new Set([...DEFAULT_SKIP_FIELD_NAMES, 'icon'])
    const byPath = Object.fromEntries(
      collectLocalizedLeaves({
        collectionSlug: 'pages',
        doc,
        payload,
        skipFieldNames: testSkipFieldNames,
      }).map((leaf) => [leaf.path.join('.'), leaf]),
    )
    expect(byPath.slug!.translatable).toBe(false)
    expect(byPath['blockBuilder.0.rows.0.columns.0.content.0.items.0.icon']!.translatable).toBe(
      false,
    )
    expect(byPath['blockBuilder.0.rows.0.columns.0.content.0.items.0.title']!.translatable).toBe(
      true,
    )
  })

  it('descends groups and reports a localized non-text field', () => {
    const doc = {
      meta: { description: 'Une description', title: 'Titre' },
      readingTime: 4,
    }

    expect(collect(doc).map((leaf) => [leaf.path.join('.'), leaf.kind])).toEqual([
      ['readingTime', 'other'],
      ['meta.title', 'string'],
      ['meta.description', 'string'],
    ])
  })

  it('never follows a relationship into another document', () => {
    // The related CTA has a localized title of its own, but it is a separate
    // document with its own Translate action.
    expect(paths({ related: { id: 2, title: 'Postuler' } })).toEqual([])
  })

  it('gives each entry of a hasMany text field its own path', () => {
    const fields = [{ hasMany: true, localized: true, name: 'keywords', type: 'text' }]
    const local = {
      blocks: {},
      collections: { tags: { config: { flattenedFields: fields } } },
    } as unknown as Payload

    const leaves = collectLocalizedLeaves({
      collectionSlug: 'tags',
      doc: { keywords: ['parole', 'vision'] },
      payload: local,
      skipFieldNames,
    })
    expect(leaves.map((leaf) => leaf.path.join('.'))).toEqual(['keywords.0', 'keywords.1'])
  })

  it('returns nothing for a collection it does not know', () => {
    expect(collect({ title: 'x' }, 'unknown-collection')).toEqual([])
  })
})

describe('write-back preserves row identity', () => {
  // Payload matches block and array rows back to storage by `id` alone, so a
  // rebuilt row drops the other locale's content inside it. These two assertions
  // are the guard for that.
  const doc = {
    _status: 'published',
    title: 'Contact',
    blockBuilder: inColumn(
      { id: 'c-1', blockType: 'content', richText: { root: { children: [] } } },
      { blockName: 'Cartes', blockType: 'cardsGrid', id: 'c-2', title: 'Équipe' },
    ),
  }

  it('keeps every id, blockType and blockName byte-identical', () => {
    const leaf = collect(doc).find((entry) => entry.name === 'title' && entry.path.length > 1)
    const next = setAtPath(doc, leaf!.path, 'Team')

    const ids = (value: unknown): string[] =>
      JSON.stringify(value).match(/"(id|blockType|blockName)":"[^"]*"/g) ?? []
    expect(ids(next)).toEqual(ids(doc))
  })

  it('shares every branch the write does not run through', () => {
    const leaf = collect(doc).find((entry) => entry.name === 'title' && entry.path.length > 1)
    const next = setAtPath(doc, leaf!.path, 'Team') as typeof doc

    const column = (value: typeof doc): unknown[] =>
      (value.blockBuilder as { rows: { columns: { content: unknown[] }[] }[] }[])[0]!.rows[0]!
        .columns[0]!.content
    expect(column(next)[0]).toBe(column(doc)[0]) // the untouched content block
    expect(column(next)[1]).not.toBe(column(doc)[1]) // the one that was written
    expect(next.title).toBe(doc.title)
  })

  it('drops a top-level key without disturbing the rest', () => {
    const next = unsetAtPath(doc, ['_status'])
    expect('_status' in next).toBe(false)
    expect(next.blockBuilder).toBe(doc.blockBuilder)
  })
})
