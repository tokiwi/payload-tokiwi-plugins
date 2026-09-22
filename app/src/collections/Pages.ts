import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      admin: { description: 'The path this page is served at, under /' },
      index: true,
      required: true,
      unique: true,
    },
    // `blockReferences` and never `blocks`: the schemas come from the root registry the
    // plugins fill, which is the whole point of registering them.
    { name: 'layout', type: 'blocks', blockReferences: ['imageCarousel'], blocks: [] },
  ],
}
