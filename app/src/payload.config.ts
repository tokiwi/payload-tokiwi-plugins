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
    // The showroom exists to render every package, so the actions are always
    // registered: a real key in the environment makes them work end to end, and
    // the placeholder below still renders the menu items, the drawer and the
    // locale picker, which is what someone opening the showroom came to see. It
    // also keeps `generate:importmap` reproducible, since the committed import
    // map must not depend on who ran it.
    deeplTranslatePlugin({
      apiBase: process.env.DEEPL_API_BASE || 'https://api-free.deepl.com',
      apiKey: process.env.DEEPL_API_KEY || 'showroom-placeholder:fx',
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'showroom-development-secret',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
