import type { ArrayField, Block, Field } from 'payload'

import type { BlockOptions } from '../../types.js'

/**
 * Built per call: Payload mutates field objects while sanitizing a config, so two blocks
 * sharing one field object would corrupt each other.
 */
const defaultFields = (): Field[] => {
  const items: ArrayField = {
    name: 'items',
    type: 'array',
    fields: [{ name: 'media', type: 'upload', relationTo: 'media', required: true }],
    labels: { plural: 'Slides', singular: 'Slide' },
    minRows: 1,
    // `minRows` alone does nothing to an empty array: Payload's array validation returns
    // early on `if (!required && arrayLength === 0)`. Marking the array required is what
    // makes "at least one slide" stick.
    required: true,
  }

  return [items]
}

/**
 * A carousel: an array of slides, each holding one image from the `media` collection.
 *
 * A heading, a caption, an autoplay toggle — everything a project disagrees about — comes
 * from `fields`.
 */
export const imageCarousel = (options: BlockOptions = {}): Block => {
  const fields = defaultFields()

  return {
    slug: 'imageCarousel',
    fields: options.fields ? options.fields(fields) : fields,
    interfaceName: 'ImageCarouselBlock',
    labels: { plural: 'Image carousels', singular: 'Image carousel' },
  }
}
