import type { CollectionConfig } from 'payload'

/** The upload collection every block schema points at through `relationTo: 'media'`. */
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  fields: [{ name: 'alt', type: 'text' }],
  upload: true,
}
