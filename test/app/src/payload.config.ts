import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'

import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { seed } from './seed'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Pages, Users],
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./test-app.db' },
  }),
  editor: lexicalEditor(),
  localization: {
    locales: ['fr', 'en', 'de'],
    defaultLocale: 'fr',
  },
  onInit: seed,
  plugins: [
    // Unlike the showroom, the suites must always see the actions, so the
    // credentials have a default: the end-to-end run points them at the fake
    // DeepL server the Playwright global setup starts.
    deeplTranslatePlugin({
      apiBase: process.env.DEEPL_API_BASE || 'http://127.0.0.1:3002',
      apiKey: process.env.DEEPL_API_KEY || 'test-key:fx',
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-app-secret',
  sharp,
})
