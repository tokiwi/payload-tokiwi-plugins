import type { Block, Config } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { BlocksMainPluginConfig } from '@tokiwi/payload-blocks-main'

import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'

// Imports the package by name, so this exercises the exports map and the built dist a
// consumer resolves, not the source.

const other: Block = { slug: 'other', fields: [] }

// The transformer reads and writes `blocks` and nothing else, so a config carrying a real
// adapter and secret would only be noise here.
const baseConfig = (blocks?: Block[]): Config =>
  ({ collections: [], ...(blocks ? { blocks } : {}) }) as unknown as Config

const apply = (options: BlocksMainPluginConfig, config: Config): Config =>
  tokiwiBlocksMain(options)(config)

describe('the config transformer', () => {
  it('registers its blocks in the root registry', () => {
    const next = apply({ blocks: [imageCarousel()] }, baseConfig())

    expect(next.blocks?.map((block) => block.slug)).toEqual(['imageCarousel'])
  })

  it('preserves the blocks the config already carries, and goes after them', () => {
    const next = apply({ blocks: [imageCarousel()] }, baseConfig([other]))

    expect(next.blocks?.map((block) => block.slug)).toEqual(['other', 'imageCarousel'])
    expect(next.blocks?.[0]).toBe(other)
  })

  it('leaves the incoming config and its array untouched', () => {
    const incoming = baseConfig([other])
    const blocks = incoming.blocks

    apply({ blocks: [imageCarousel()] }, incoming)

    expect(incoming.blocks).toBe(blocks)
    expect(incoming.blocks).toHaveLength(1)
  })

  it('is idempotent: a second pass registers nothing twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const options = { blocks: [imageCarousel()] }

    const next = apply(options, apply(options, baseConfig()))

    expect(next.blocks?.map((block) => block.slug)).toEqual(['imageCarousel'])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('is a strict no-op when disabled, down to the object identity', () => {
    const incoming = baseConfig([other])

    expect(apply({ blocks: [imageCarousel()], disabled: true }, incoming)).toBe(incoming)
  })

  it('refuses a registration with nothing in it', () => {
    expect(() => apply({ blocks: [] }, baseConfig())).toThrow(/at least one block/)
  })
})

describe('the imageCarousel schema', () => {
  it('ships one array of slides, each holding one required upload', () => {
    const block = imageCarousel()

    expect(block.slug).toBe('imageCarousel')
    expect(block.interfaceName).toBe('ImageCarouselBlock')
    expect(block.fields).toMatchObject([{ name: 'slides', type: 'array', required: true }])
    expect(block.fields[0]).toMatchObject({
      fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    })
  })

  it('hands the default fields to the escape hatch', () => {
    const block = imageCarousel({
      fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields],
    })

    expect(block.fields.map((field) => 'name' in field && field.name)).toEqual([
      'heading',
      'slides',
    ])
  })

  it('builds fresh field objects per call, so Payload cannot sanitize one twice', () => {
    expect(imageCarousel().fields[0]).not.toBe(imageCarousel().fields[0])
  })
})
