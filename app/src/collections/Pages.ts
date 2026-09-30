import type { CollectionConfig } from 'payload'

export const Pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'summary', type: 'textarea', localized: true },
    { name: 'body', type: 'richText', localized: true },
    { name: 'url', type: 'text' },
    // `blockReferences` and never `blocks`: the schemas come from the root registry the
    // blocks plugin fills, which is the whole reason it registers them. A field carrying
    // both is refused by Payload.
    { name: 'layout', type: 'blocks', blockReferences: ['imageCarousel'], blocks: [] },
    {
      name: 'sections',
      type: 'blocks',
      blocks: [
        {
          slug: 'callout',
          fields: [
            { name: 'heading', type: 'text', localized: true },
            { name: 'text', type: 'richText', localized: true },
          ],
        },
      ],
    },
  ],
}
