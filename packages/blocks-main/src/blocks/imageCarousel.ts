import type { ArrayField, Block, Field } from 'payload'

import type { BlockOptions } from '../types.js'

export const IMAGE_CAROUSEL_SLUG = 'imageCarousel'

/**
 * Built per call: Payload mutates field objects while sanitizing a config, so two configs
 * sharing one field object would corrupt each other.
 */
const defaultFields = (): Field[] => {
  const slides: ArrayField = {
    name: 'slides',
    type: 'array',
    fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    labels: { plural: 'Slides', singular: 'Slide' },
    minRows: 1,
    // `minRows` alone does nothing to an empty array: Payload's array validation returns
    // early when the field is not required. Marking the array required is what makes "at
    // least one slide" stick.
    required: true,
  }

  return [slides]
}

/**
 * A carousel: an array of slides, each holding one image from the `media` upload
 * collection.
 *
 * A heading, a caption, an autoplay toggle, or an upload collection under another slug,
 * all come from `fields`.
 */
export const imageCarousel = (options: BlockOptions = {}): Block => {
  const fields = defaultFields()

  return {
    slug: IMAGE_CAROUSEL_SLUG,
    fields: options.fields ? options.fields(fields) : fields,
    interfaceName: 'ImageCarouselBlock',
    labels: { plural: 'Image carousels', singular: 'Image carousel' },
  }
}
