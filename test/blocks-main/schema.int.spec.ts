import type { CollectionConfig, Config, DatabaseAdapterObj } from 'payload'

import { buildConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'

/**
 * A block schema is a plain object until Payload sanitizes it. Sanitization is where a
 * field type, an upload relation or a block reference is rejected, so this suite runs the
 * package's output through the real one.
 */

// `buildConfig` only stores the adapter; it is called at `getPayload` time, which these
// assertions never reach.
const db = (() => ({ defaultIDType: 'number' })) as unknown as DatabaseAdapterObj

const media: CollectionConfig = {
  slug: 'media',
  fields: [{ name: 'alt', type: 'text' }],
  upload: true,
}

// `blockReferences` and never `blocks`: the schemas come from the root registry the
// plugin fills, which is the whole reason it registers them.
const pages: CollectionConfig = {
  slug: 'pages',
  fields: [{ name: 'layout', type: 'blocks', blockReferences: ['imageCarousel'], blocks: [] }],
}

const build = async (collections: Config['collections']) =>
  await buildConfig({
    collections,
    db,
    plugins: [tokiwiBlocksMain({ blocks: [imageCarousel()] })],
    secret: 'blocks-main-int-secret',
  })

describe('imageCarousel, sanitized by Payload', () => {
  it('registers a block a collection can reference by slug', async () => {
    const config = await build([pages, media])

    expect(config.blocks?.map((block) => block.slug)).toEqual(['imageCarousel'])

    const layout = config.collections
      .find((collection) => collection.slug === 'pages')
      ?.fields.find((field) => 'name' in field && field.name === 'layout')

    expect(layout && 'blockReferences' in layout && layout.blockReferences).toEqual([
      'imageCarousel',
    ])
  })

  it('keeps the slides array and its upload through sanitization', async () => {
    const config = await build([pages, media])
    const block = config.blocks?.[0]
    const slides = block?.fields.find((field) => 'name' in field && field.name === 'slides')

    expect(slides).toMatchObject({ type: 'array', required: true, minRows: 1 })
    expect(slides && 'fields' in slides && slides.fields[0]).toMatchObject({
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    })
  })

  it('names the upload collection it needs, loudly, when the project has none', async () => {
    await expect(build([pages])).rejects.toThrow(/invalid relationship/i)
  })
})
