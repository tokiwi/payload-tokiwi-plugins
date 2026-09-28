import { describe, expect, it } from 'vitest'

import { formatPath, getAtPath, setAtPath, setManyAtPath, unsetAtPath } from '../src/path'

// Payload matches block and array rows back to storage by `id` alone, so a write
// that rebuilds a row drops the other locale's content inside it. Every assertion
// here is about what is shared, not only about what changed.

describe('getAtPath', () => {
  it('reads through objects and array indices', () => {
    expect(getAtPath({ a: [{ b: 'x' }] }, ['a', 0, 'b'])).toBe('x')
  })

  it('returns undefined rather than throwing on a missing branch', () => {
    expect(getAtPath({ a: null }, ['a', 'b'])).toBeUndefined()
    expect(getAtPath({ a: 'scalar' }, ['a', 'b'])).toBeUndefined()
  })
})

describe('setAtPath', () => {
  it('shares every branch the path does not run through', () => {
    const untouched = { keep: 'me' }
    const root = { a: [{ b: 'x' }], other: untouched }
    const next = setAtPath(root, ['a', 0, 'b'], 'y')

    expect(next).not.toBe(root)
    expect(next.other).toBe(untouched)
    expect(getAtPath(next, ['a', 0, 'b'])).toBe('y')
    expect(getAtPath(root, ['a', 0, 'b'])).toBe('x')
  })

  it('returns the root unchanged when the key is absent', () => {
    const root = { a: 1 }
    expect(setAtPath(root, ['missing'], 2)).toBe(root)
  })

  it('returns the root unchanged when the value is already there', () => {
    const root = { a: { b: 'x' } }
    expect(setAtPath(root, ['a', 'b'], 'x')).toBe(root)
  })
})

describe('setManyAtPath', () => {
  it('applies several writes while still sharing the spine', () => {
    const untouched = { keep: 'me' }
    const root = { a: { b: '1', c: '2' }, other: untouched }
    const next = setManyAtPath(root, [
      { path: ['a', 'b'], value: '9' },
      { path: ['a', 'c'], value: '8' },
    ])

    expect(next.a).toEqual({ b: '9', c: '8' })
    expect(next.other).toBe(untouched)
  })
})

describe('unsetAtPath', () => {
  it('removes an object key, which is not the same as clearing it', () => {
    expect(unsetAtPath({ a: 1, b: 2 }, ['b'])).toEqual({ a: 1 })
  })

  it('clears an indexed leaf instead of splicing, so later paths keep their index', () => {
    expect(unsetAtPath({ a: ['x', 'y'] }, ['a', 0])).toEqual({ a: [null, 'y'] })
  })

  it('returns the root unchanged when the key is absent', () => {
    const root = { a: 1 }
    expect(unsetAtPath(root, ['b'])).toBe(root)
  })
})

describe('formatPath', () => {
  it('reads as the dotted path an error message shows', () => {
    expect(formatPath(['sections', 0, 'rows', 1, 'title'])).toBe('sections.0.rows.1.title')
  })
})
