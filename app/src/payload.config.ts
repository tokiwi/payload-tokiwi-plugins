import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'

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
  plugins: [
    // The showroom is what a human opens to see the plugins side by side, so the
    // credentials come from the environment and the actions are simply absent
    // until someone sets them.
    deeplTranslatePlugin(),
  ],
  secret: process.env.PAYLOAD_SECRET || 'showroom-development-secret',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
