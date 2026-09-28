import { describe, expect, it } from 'vitest'

import { buildTaggedText, escapeXml, parseTaggedText, splitSegment, unescapeXml } from '../src/xml'

// Pure string handling: no Payload, no network. These are the rules that decide
// whether a paragraph's bold/link runs come back attached to the right words.

describe('splitSegment', () => {
  it('hoists surrounding whitespace out of the translatable core', () => {
    expect(splitSegment('  Bonjour le monde  ')).toEqual({
      core: 'Bonjour le monde',
      leading: '  ',
      trailing: '  ',
    })
  })

  it('ignores values with nothing to translate', () => {
    expect(splitSegment('')).toBeNull()
    expect(splitSegment('   ')).toBeNull()
    expect(splitSegment('—')).toBeNull()
    expect(splitSegment('2024')).toBeNull()
    expect(splitSegment(' · ')).toBeNull()
  })

  it('keeps a value that is a letter in any script', () => {
    expect(splitSegment('Ärger')?.core).toBe('Ärger')
    expect(splitSegment('Ω')?.core).toBe('Ω')
    expect(splitSegment('研究')?.core).toBe('研究')
  })

  it('stays linear on a long run of whitespace that sits inside the text, not at an edge', () => {
    // A backtracking `^(\s*)([\s\S]*?)(\s*)$` costs quadratic time here: pasted
    // content with irregular internal spacing hits this shape, not just a crafted input.
    const text = `a${' '.repeat(60_000)}b`
    const start = performance.now()
    const segment = splitSegment(text)
    const elapsed = performance.now() - start
    expect(segment).toEqual({ core: text, leading: '', trailing: '' })
    expect(elapsed).toBeLessThan(300)
  })
})

describe('escaping', () => {
  it('round-trips the three XML metacharacters', () => {
    const raw = 'R&D <strong> tags > here'
    expect(escapeXml(raw)).toBe('R&amp;D &lt;strong&gt; tags &gt; here')
    expect(unescapeXml(escapeXml(raw))).toBe(raw)
  })

  it('does not decode an escaped entity twice', () => {
    // `&lt;` in the source must survive as the literal text `&lt;`, not become `<`.
    expect(unescapeXml(escapeXml('&lt;'))).toBe('&lt;')
  })

  it('decodes the entities DeepL introduces on its own', () => {
    expect(unescapeXml('&quot;oui&quot; &#39;non&#39; &#x2014;')).toBe('"oui" \'non\' —')
  })

  it('leaves a numeric entity above the Unicode range as-is rather than throwing', () => {
    expect(() => unescapeXml('&#xFFFFFFFF;')).not.toThrow()
    expect(unescapeXml('&#xFFFFFFFF;')).toBe('&#xFFFFFFFF;')
  })
})

describe('parseTaggedText', () => {
  const segments = [
    { core: 'Nous utilisons des', leading: '', trailing: ' ' },
    { core: 'méthodes bayésiennes', leading: '', trailing: '' },
    { core: 'éprouvées.', leading: ' ', trailing: '' },
  ]

  it('builds tags with the whitespace outside them', () => {
    expect(buildTaggedText(segments)).toBe(
      '<s i="0">Nous utilisons des</s> <s i="1">méthodes bayésiennes</s> <s i="2">éprouvées.</s>',
    )
  })

  it('assigns by index, not by position, when DeepL reorders the tags', () => {
    const response = '<s i="1">Bayesian</s> <s i="0">We use proven</s> <s i="2">methods.</s>'
    expect(parseTaggedText(response, 3)).toEqual({
      ok: true,
      values: ['We use proven', 'Bayesian', 'methods.'],
    })
  })

  it('concatenates a repeated index in document order', () => {
    const response = '<s i="0">We use</s> <s i="0"> proven</s><s i="1">x</s><s i="2">y</s>'
    expect(parseTaggedText(response, 3)).toEqual({
      ok: true,
      values: ['We use proven', 'x', 'y'],
    })
  })

  it('accepts single quotes and tolerates whitespace between tags', () => {
    expect(parseTaggedText("  <s i='0'>a</s>\n <s i='1'>b</s>  ", 2)).toEqual({
      ok: true,
      values: ['a', 'b'],
    })
  })

  it('unescapes the tag contents', () => {
    expect(parseTaggedText('<s i="0">R&amp;D</s>', 1)).toEqual({ ok: true, values: ['R&D'] })
  })

  it('fails when an index never comes back', () => {
    const result = parseTaggedText('<s i="0">a</s><s i="2">c</s>', 3)
    expect(result.ok).toBe(false)
  })

  it('fails when DeepL emits text outside the tags', () => {
    const result = parseTaggedText('<s i="0">a</s> stray words <s i="1">b</s>', 2)
    expect(result).toEqual({ ok: false, reason: 'text outside the tags' })
  })

  it('fails on an unbalanced tag', () => {
    const result = parseTaggedText('<s i="0">a</s><s i="1">b', 2)
    expect(result.ok).toBe(false)
  })

  it('fails when a run comes back empty', () => {
    const result = parseTaggedText('<s i="0">a</s><s i="1"></s>', 2)
    expect(result.ok).toBe(false)
  })

  it('fails on an index outside the expected range', () => {
    expect(parseTaggedText('<s i="7">a</s>', 1).ok).toBe(false)
  })
})
