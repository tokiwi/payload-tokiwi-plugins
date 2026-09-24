import { describe, expect, it } from 'vitest'

import { applyLexicalStrings, extractLexicalStrings } from '../src/lexical'

// Editor states are hand-built so each assertion names the node shape it is about.
// Nothing here touches Payload or the network.

const textNode = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  version: 1,
  ...extra,
})

const state = (...children: unknown[]) => ({
  root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 },
})

const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children, version: 1 })

/** The text nodes of the first block in a state, for asserting on a round-trip. */
const runsOf = (value: unknown): Record<string, unknown>[] =>
  (value as { root: { children: { children: Record<string, unknown>[] }[] } }).root.children[0]!
    .children ?? []

describe('extractLexicalStrings', () => {
  it('groups the runs of one paragraph together', () => {
    const groups = extractLexicalStrings(
      state(
        paragraph(
          textNode('Nous utilisons des '),
          textNode('méthodes bayésiennes', { format: 1 }),
          textNode(' éprouvées.'),
        ),
      ),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]!.segments.map((segment) => segment.core)).toEqual([
      'Nous utilisons des',
      'méthodes bayésiennes',
      'éprouvées.',
    ])
  })

  it('starts a new group at each block-level node', () => {
    const groups = extractLexicalStrings(
      state(
        { type: 'heading', tag: 'h2', children: [textNode('Recherche')] },
        paragraph(textNode('Un paragraphe.')),
        { type: 'quote', children: [textNode('Une citation.')] },
      ),
    )
    expect(groups).toHaveLength(3)
  })

  it('treats each table cell as its own group', () => {
    const groups = extractLexicalStrings(
      state({
        type: 'table',
        children: [
          {
            type: 'tablerow',
            children: [
              { type: 'tablecell', children: [paragraph(textNode('Nom'))] },
              { type: 'tablecell', children: [paragraph(textNode('Rôle'))] },
            ],
          },
        ],
      }),
    )
    // One group per `tablecell`, plus the `paragraph` nested inside each of them.
    expect(groups.map((group) => group.segments.map((segment) => segment.core))).toEqual([
      ['Nom'],
      ['Rôle'],
    ])
  })

  it('follows a link but never its url', () => {
    const groups = extractLexicalStrings(
      state(
        paragraph(textNode('Voir '), {
          type: 'link',
          fields: { linkType: 'custom', url: 'https://example.test/research' },
          children: [textNode('la page recherche')],
        }),
      ),
    )
    expect(groups[0]!.segments.map((segment) => segment.core)).toEqual([
      'Voir',
      'la page recherche',
    ])
  })

  it('never touches an autolink, whose text is the url itself', () => {
    const groups = extractLexicalStrings(
      state(
        paragraph({
          type: 'autolink',
          fields: { linkType: 'custom', url: 'https://example.test' },
          children: [textNode('https://example.test')],
        }),
      ),
    )
    expect(groups).toEqual([])
  })

  it('never translates a CodeBlock, an upload or a relationship node', () => {
    const groups = extractLexicalStrings(
      state(
        {
          type: 'block',
          fields: { blockType: 'Code', code: 'const x = "bonjour"', language: 'ts' },
        },
        { type: 'upload', relationTo: 'media', value: 3, fields: {} },
        { type: 'relationship', relationTo: 'pages', value: 7 },
        { type: 'horizontalrule' },
      ),
    )
    expect(groups).toEqual([])
  })

  it('keeps linebreak-separated runs as separate segments of one group', () => {
    const groups = extractLexicalStrings(
      state(
        paragraph(textNode('Première ligne'), { type: 'linebreak' }, textNode('Deuxième ligne')),
      ),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.segments).toHaveLength(2)
  })

  it('skips empty, whitespace-only and letter-free runs', () => {
    const groups = extractLexicalStrings(
      state(paragraph(textNode(''), textNode('   '), textNode('2024'), textNode('—'))),
    )
    expect(groups).toEqual([])
  })

  it('returns nothing rather than throwing on a malformed state', () => {
    expect(extractLexicalStrings(undefined)).toEqual([])
    expect(extractLexicalStrings({})).toEqual([])
    expect(extractLexicalStrings({ root: null })).toEqual([])
    expect(extractLexicalStrings({ root: { type: 'root' } })).toEqual([])
  })
})

describe('applyLexicalStrings', () => {
  const original = state(
    paragraph(
      textNode('Nous utilisons des '),
      textNode('méthodes bayésiennes', {
        $: { decoration: 'tagline' },
        format: 1,
        style: 'color:red',
      }),
      textNode(' éprouvées.'),
    ),
    { type: 'block', fields: { blockType: 'Code', code: 'const x = 1' } },
  )

  it('replaces only the text and keeps every formatting key', () => {
    const groups = extractLexicalStrings(original)
    const next = applyLexicalStrings(original, groups, [['We use proven', 'Bayesian', 'methods.']])

    const children = runsOf(next)
    expect(children.map((child) => child.text)).toEqual(['We use proven ', 'Bayesian', ' methods.'])
    expect(children[1]).toMatchObject({
      $: { decoration: 'tagline' },
      format: 1,
      mode: 'normal',
      style: 'color:red',
      version: 1,
    })
  })

  it('reattaches the source whitespace and drops whatever DeepL added', () => {
    const groups = extractLexicalStrings(original)
    const next = applyLexicalStrings(original, groups, [
      ['  We use proven  ', 'Bayesian', 'methods.'],
    ])
    // The source run is "Nous utilisons des ": no leading space, one trailing
    // space. This is the spacing the translation inherits, however DeepL
    // decided to pad its own answer.
    expect(runsOf(next)[0]!.text).toBe('We use proven ')
    expect(runsOf(next)[2]!.text).toBe(' methods.')
  })

  it('leaves a group alone when its translation is null, and shares untouched nodes', () => {
    const groups = extractLexicalStrings(original)
    const next = applyLexicalStrings(original, groups, [null])

    expect(next).toBe(original)
  })

  it('passes non-translated siblings through by reference', () => {
    const groups = extractLexicalStrings(original)
    const next = applyLexicalStrings(original, groups, [['a', 'b', 'c']])

    // The CodeBlock node is not cloned: identity is the guarantee that nothing
    // inside it was rewritten.
    expect(next.root.children[1]).toBe(original.root.children[1])
    expect(next).not.toBe(original)
  })
})
