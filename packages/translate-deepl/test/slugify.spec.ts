import { describe, expect, it } from 'vitest'

import { isPlaceholderSlug, slugifyPath } from '../src/slugify'

// DeepL answers a slug with prose, so everything it returns has to survive this.

describe('slugifyPath', () => {
  it('normalises what DeepL actually returns for a path slug', () => {
    // Verified against the live API: "about-us/management" comes back like this.
    expect(slugifyPath('à-propos-de-nous/équipe-de-direction')).toBe(
      'a-propos-de-nous/equipe-de-direction',
    )
  })

  it('keeps / as a separator and collapses everything else', () => {
    expect(slugifyPath('À propos de nous / Notre Équipe')).toBe('a-propos-de-nous/notre-equipe')
  })

  it('drops empty segments and surrounding slashes', () => {
    expect(slugifyPath('/about-us//team/')).toBe('about-us/team')
  })

  it('leaves a single-segment slug single', () => {
    expect(slugifyPath('Direction')).toBe('direction')
  })

  it('treats a slash-only value as the root path', () => {
    expect(slugifyPath('/')).toBe('/')
    expect(slugifyPath('///')).toBe('/')
  })

  it('returns nothing when there is nothing slug-worthy left', () => {
    expect(slugifyPath('   ')).toBe('')
    expect(slugifyPath('—')).toBe('')
  })
})

describe('isPlaceholderSlug', () => {
  it('recognises what the backfill left behind', () => {
    expect(isPlaceholderSlug('untitled-87')).toBe(true)
    expect(isPlaceholderSlug('untitled')).toBe(true)
    expect(isPlaceholderSlug('UNTITLED-4')).toBe(true)
  })

  it('treats empty and missing as replaceable', () => {
    expect(isPlaceholderSlug('')).toBe(true)
    expect(isPlaceholderSlug('   ')).toBe(true)
    expect(isPlaceholderSlug(null)).toBe(true)
    expect(isPlaceholderSlug(undefined)).toBe(true)
  })

  it('leaves a slug an editor chose alone', () => {
    expect(isPlaceholderSlug('about-us/management')).toBe(false)
    expect(isPlaceholderSlug('direction')).toBe(false)
    // Not a placeholder just because the word appears somewhere in it.
    expect(isPlaceholderSlug('untitled-works-of-art')).toBe(false)
  })

  it('judges a path by its last segment', () => {
    expect(isPlaceholderSlug('about-us/untitled-9')).toBe(true)
    expect(isPlaceholderSlug('untitled-9/management')).toBe(false)
  })

  it('accepts a custom pattern', () => {
    expect(isPlaceholderSlug('page-12', /^page-\d+$/)).toBe(true)
    expect(isPlaceholderSlug('untitled-12', /^page-\d+$/)).toBe(false)
  })
})
