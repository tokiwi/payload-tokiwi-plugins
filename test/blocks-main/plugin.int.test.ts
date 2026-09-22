import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'
import type { Block, Config } from 'payload'
import { describe, expect, it, vi } from 'vitest'

// The transformer reads and writes `blocks` and nothing else; a config carrying a real
// database adapter and secret would only be noise here.
const configWith = (blocks?: Block[]): Config =>
  ({ collections: [], ...(blocks ? { blocks } : {}) }) as unknown as Config

const other: Block = { slug: 'other', fields: [] }

describe('tokiwiBlocksMain', () => {
  it('registers its blocks', () => {
    const config = tokiwiBlocksMain({ blocks: [imageCarousel()] })(configWith())

    expect(config.blocks?.map((block) => block.slug)).toEqual(['imageCarousel'])
  })

  it('preserves blocks the config already carries', () => {
    const config = tokiwiBlocksMain({ blocks: [imageCarousel()] })(configWith([other]))

    expect(config.blocks?.map((block) => block.slug)).toEqual(['other', 'imageCarousel'])
  })

  it('leaves the incoming config untouched', () => {
    const incoming = configWith([other])
    const blocks = incoming.blocks

    tokiwiBlocksMain({ blocks: [imageCarousel()] })(incoming)

    expect(incoming.blocks).toBe(blocks)
    expect(incoming.blocks).toHaveLength(1)
  })

  it('is idempotent: a second pass registers nothing twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plugin = tokiwiBlocksMain({ blocks: [imageCarousel()] })

    const config = plugin(plugin(configWith()))

    expect(config.blocks?.map((block) => block.slug)).toEqual(['imageCarousel'])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('is a strict no-op when disabled', () => {
    const incoming = configWith([other])

    expect(tokiwiBlocksMain({ blocks: [imageCarousel()], disabled: true })(incoming)).toBe(incoming)
  })

  it('refuses an empty registration', () => {
    expect(() => tokiwiBlocksMain({ blocks: [] })(configWith())).toThrow(/at least one block/)
  })
})

describe('imageCarousel', () => {
  it('ships a minimal schema', () => {
    const block = imageCarousel()

    expect(block.slug).toBe('imageCarousel')
    expect(block.fields).toHaveLength(1)
    expect(block.fields[0]).toMatchObject({ name: 'items', type: 'array', required: true })
  })

  it('hands the default fields to the escape hatch', () => {
    const block = imageCarousel({
      fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields],
    })

    expect(block.fields.map((field) => 'name' in field && field.name)).toEqual(['heading', 'items'])
  })

  it('builds fresh fields on every call, so sanitization cannot leak across configs', () => {
    expect(imageCarousel().fields[0]).not.toBe(imageCarousel().fields[0])
  })
})
