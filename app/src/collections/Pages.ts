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
