import type { CollectionConfig } from 'payload'

/** The upload collection the block schemas point at through `relationTo: 'media'`. */
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  fields: [{ name: 'alt', type: 'text', localized: true }],
  upload: true,
}
