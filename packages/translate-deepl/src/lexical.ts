/**
 * Turning a Lexical editor state into translatable strings, and back.
 *
 * Only a text node's `text` is ever replaced. Everything that carries meaning
 * about how it looks — `format` (the bold/italic bitmask), `style`, `detail`,
 * `mode`, and the `TextStateFeature`'s `$` decoration — travels with the node and
 * is passed through by reference, so formatting cannot drift.
 *
 * Text nodes are grouped by their nearest block-level ancestor so that a sentence
 * broken into several formatting runs reaches DeepL as one sentence. See `xml.ts`
 * for the tag protocol that makes that safe.
 */

import type { Path } from './path'
import type { TaggedSegment } from './xml'

import { setManyAtPath } from './path'
import { splitSegment } from './xml'

type Node = Record<string, unknown>

/**
 * Nodes that start a new group. A sentence never spans two of them, and sending
 * a whole list or table as one string would make the tag mapping fragile for no
 * translation benefit.
 */
const BLOCK_LEVEL = new Set(['heading', 'listitem', 'paragraph', 'quote', 'tablecell'])

/**
 * Nodes whose subtree is never translated.
 *
 * `block` / `inlineBlock` hold Payload fields, and a code block is the case that
 * matters: source code must not be translated.
 *
 * `autolink` is the subtle one: its child text node *is* the URL it links to, so
 * recursing into it would hand DeepL a URL to paraphrase.
 */
const SKIPPED_TYPES = new Set([
  'autolink',
  'block',
  'horizontalrule',
  'inlineBlock',
  'linebreak',
  'relationship',
  'tab',
  'upload',
])

/** One block-level node's worth of translatable runs. */
export type LexicalGroup = {
  /** Path to each participating text node, relative to the editor state. */
  nodePaths: Path[]
  /** One entry per `nodePaths` entry, in the same order. */
  segments: TaggedSegment[]
}

const asNode = (value: unknown): Node | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : null

const childrenOf = (node: Node): unknown[] => (Array.isArray(node.children) ? node.children : [])

/**
 * Every translatable run in the state, grouped by block-level ancestor. Groups
 * with nothing to translate are dropped, so an empty result means "nothing to do"
 * and the caller can skip the field entirely.
 *
 * A malformed state returns `[]` rather than throwing, because this runs inside a
 * save the editor is waiting on.
 */
export const extractLexicalStrings = (state: unknown): LexicalGroup[] => {
  const root = asNode(asNode(state)?.root)
  if (!root) return []

  const groups: LexicalGroup[] = []

  const walk = (node: Node, path: Path, group: LexicalGroup | null): void => {
    const type = typeof node.type === 'string' ? node.type : ''
    if (SKIPPED_TYPES.has(type)) return

    if (type === 'text') {
      if (typeof node.text !== 'string') return
      const segment = splitSegment(node.text)
      if (!segment) return

      const target = group ?? { nodePaths: [], segments: [] }
      if (!group) groups.push(target)
      target.nodePaths.push(path)
      target.segments.push(segment)
      return
    }

    let nextGroup = group
    if (BLOCK_LEVEL.has(type)) {
      nextGroup = { nodePaths: [], segments: [] }
      groups.push(nextGroup)
    }

    const children = childrenOf(node)
    for (let index = 0; index < children.length; index++) {
      const child = asNode(children[index])
      if (child) walk(child, [...path, 'children', index], nextGroup)
    }
  }

  const rootChildren = childrenOf(root)
  for (let index = 0; index < rootChildren.length; index++) {
    const child = asNode(rootChildren[index])
    if (child) walk(child, ['root', 'children', index], null)
  }

  return groups.filter((group) => group.segments.length > 0)
}

/**
 * Writes translated runs back. `translations[i]` holds one string per segment of
 * `groups[i]`, or `null` to leave that group alone — which is how a group whose
 * tag round-trip failed survives untouched while the rest of the document is still
 * updated.
 *
 * The translated run is trimmed and the *source* node's leading and trailing
 * whitespace reattached: DeepL renormalises whitespace next to a tag, and the
 * corpus relies on those runs to separate two sentences inside one paragraph.
 */
export const applyLexicalStrings = <T>(
  state: T,
  groups: LexicalGroup[],
  translations: (null | string[])[],
): T => {
  const writes: { path: Path; value: unknown }[] = []

  groups.forEach((group, groupIndex) => {
    const translated = translations[groupIndex]
    if (!translated) return

    group.nodePaths.forEach((nodePath, segmentIndex) => {
      const value = translated[segmentIndex]
      if (typeof value !== 'string' || !value.trim()) return
      const { leading, trailing } = group.segments[segmentIndex]
      writes.push({ path: [...nodePath, 'text'], value: `${leading}${value.trim()}${trailing}` })
    })
  })

  return setManyAtPath(state, writes)
}
