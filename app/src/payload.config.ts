import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Pages } from './collections/Pages'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Pages, Users],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./showroom.db' },
  }),
  editor: lexicalEditor(),
  localization: {
    locales: ['fr', 'en', 'de'],
    defaultLocale: 'fr',
  },
  secret: process.env.PAYLOAD_SECRET || 'showroom-development-secret',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
