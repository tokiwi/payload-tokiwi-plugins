/**
 * The tag protocol used to translate a run of differently-formatted text as one
 * sentence.
 *
 * A Lexical paragraph is a list of text nodes, one per formatting run: "We use
 * **Bayesian** methods" is three nodes. Translating each node on its own hands
 * DeepL three sentence fragments and gets three bad translations back, so the
 * whole paragraph is sent as one string with each run wrapped in a numbered tag
 * and `tag_handling: 'xml'`. DeepL moves the tags with the words, which is
 * exactly what reordering between French and English needs.
 *
 * Everything emitted outside a tag is whitespace by construction, so the parser
 * can treat any other loose text as evidence that the round-trip broke.
 */

/** One formatting run: only `core` is translated, the whitespace is reattached verbatim. */
export type TaggedSegment = {
  /** Whitespace before the translatable text. */
  leading: string
  /** The text handed to DeepL, guaranteed non-empty and not whitespace-only. */
  core: string
  /** Whitespace after the translatable text. */
  trailing: string
}

export type ParseResult = { ok: true; values: string[] } | { ok: false; reason: string }

/** `&` first, or the entities produced by the later replacements get double-escaped. */
export const escapeXml = (input: string): string =>
  input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

/**
 * Reverses `escapeXml`, and also decodes the entities DeepL sometimes introduces
 * on its own (`&quot;` around a quoted phrase, numeric escapes for punctuation).
 * `&amp;` is resolved in the same pass rather than last, so `&amp;lt;` decodes to
 * the literal text `&lt;` instead of `<`.
 */
export const unescapeXml = (input: string): string =>
  input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    return named ?? match
  })

/**
 * Splits a text node's value into the whitespace kept and the text sent. The
 * trailing whitespace never goes inside the tag, since DeepL normalises
 * whitespace next to a tag and a run's trailing double space can be the only
 * thing separating two sentences.
 *
 * Returns `null` for nothing worth translating: empty, whitespace only, or
 * without a single letter (`"—"`, `"2024"`, `"·"`).
 */
export const splitSegment = (text: string): TaggedSegment | null => {
  if (!text) return null
  const core = text.trim()
  if (!core) return null
  // \p{L} rather than a-z: accented French, Greek in a formula, CJK.
  if (!/\p{L}/u.test(core)) return null
  // Not `/^(\s*)([\s\S]*?)(\s*)$/`: that regex backtracks quadratically on
  // text carrying a long run of whitespace that isn't at either end, which is
  // exactly what pasted-in content produces.
  const leading = text.slice(0, text.length - text.trimStart().length)
  const trailing = text.slice(text.trimEnd().length)
  return { core, leading, trailing }
}

export const buildTaggedText = (segments: TaggedSegment[]): string =>
  segments
    .map(
      (segment, index) =>
        `${escapeXml(segment.leading)}<s i="${index}">${escapeXml(segment.core)}</s>${escapeXml(
          segment.trailing,
        )}`,
    )
    .join('')

/** Matches both quoting styles. DeepL echoes attributes verbatim but has no contract to. */
const TAG_PATTERN = /<s\s+i=["'](\d+)["']\s*>([\s\S]*?)<\/s\s*>/g

/**
 * Reads a tagged response back into one value per segment.
 *
 * Tolerated, because they are normal DeepL behaviour:
 *   - indices coming back in a different order, which is the point of the tags.
 *   - one index appearing several times, when DeepL split a sentence: the
 *     fragments are concatenated in the order they appear.
 *   - whitespace between or around tags, which DeepL freely renormalises.
 *
 * Rejected, because the caller can recover by translating node by node:
 *   - a missing index, an unbalanced tag, or text outside the tags, all of which
 *     mean the mapping back onto the nodes is no longer trustworthy.
 *   - an empty result for a non-empty source, i.e. DeepL swallowed the content.
 */
export const parseTaggedText = (response: string, expected: number): ParseResult => {
  const collected: string[][] = Array.from({ length: expected }, () => [])
  let outside = ''
  let cursor = 0

  TAG_PATTERN.lastIndex = 0
  let match: null | RegExpExecArray
  while ((match = TAG_PATTERN.exec(response)) !== null) {
    outside += response.slice(cursor, match.index)
    cursor = match.index + match[0].length

    const index = Number.parseInt(match[1] ?? '', 10)
    if (!Number.isInteger(index) || index < 0 || index >= expected) {
      return { ok: false, reason: `unexpected tag index ${match[1]}` }
    }
    // `index` was just bounds-checked against `expected`, which is `collected`'s length.
    collected[index]!.push(unescapeXml(match[2] ?? ''))
  }
  outside += response.slice(cursor)

  // An `<s>` with no closing tag never matches `TAG_PATTERN`, so it lands here as
  // ordinary text and is caught by the same check as any other stray character.
  if (/\S/.test(outside)) {
    return { ok: false, reason: 'text outside the tags' }
  }

  const values: string[] = []
  for (let index = 0; index < expected; index++) {
    // `collected` was built with `expected` entries, so every index in range exists.
    const fragments = collected[index]!
    if (fragments.length === 0) {
      return { ok: false, reason: `missing tag ${index}` }
    }
    const value = fragments.join('')
    if (!value.trim()) {
      return { ok: false, reason: `empty translation for tag ${index}` }
    }
    values.push(value)
  }

  return { ok: true, values }
}
