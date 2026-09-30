import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { imageCarousel, tokiwiBlocksMain } from '@tokiwi/payload-blocks-main'
import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'

import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Pages, Media, Users],
  db: sqliteAdapter({ client: { url: 'file:./consumer.db' } }),
  editor: lexicalEditor(),
  localization: {
    locales: ['fr', 'en', 'de'],
    defaultLocale: 'fr',
  },
  // The pull request adding a package registers its plugin here. The pack job does
  // not edit this file: it fails if the new package is not wired in.
  plugins: [
    deeplTranslatePlugin({ apiBase: 'https://api-free.deepl.com', apiKey: 'fixture:fx' }),
    // No Mantine here on purpose: registering the schemas must not need the optional peer
    // the front-end templates use.
    tokiwiBlocksMain({ blocks: [imageCarousel()] }),
  ],
  secret: 'consumer-fixture-secret',
  sharp,
})
