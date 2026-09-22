import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { importMap: { baseDir: dirname }, user: Users.slug },
  collections: [Pages, Media, Users],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URI || 'file:./showroom.db' } }),
  plugins: [
    tokiwiBlocksMain({
      // `heading` is not part of the shipped schema: the showroom adds it through the
      // block's escape hatch, the way a project does.
      blocks: [
        imageCarousel({
          fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields],
        }),
      ],
    }),
  ],
  // The showroom is a local development application holding nothing worth protecting, so
  // it starts without an environment file. Any real project sets this.
  secret: process.env.PAYLOAD_SECRET || 'showroom',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
