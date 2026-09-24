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
  db: sqliteAdapter({ client: { url: 'file:./consumer.db' } }),
  editor: lexicalEditor(),
  localization: {
    locales: ['fr', 'en', 'de'],
    defaultLocale: 'fr',
  },
  // The pull request adding a package registers its plugin here. The pack job does
  // not edit this file: it fails if the new package is not wired in.
  secret: 'consumer-fixture-secret',
  sharp,
})
