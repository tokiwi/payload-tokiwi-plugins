import type { Payload } from 'payload'

export const SEED_USER = { email: 'editor@example.test', password: 'test-password-1234' }

/**
 * Brings an empty database to the single known state every suite starts from.
 * Idempotent: a second call on a seeded database does nothing.
 */
export const seed = async (payload: Payload): Promise<void> => {
  const existing = await payload.count({ collection: 'users' })
  if (existing.totalDocs > 0) return

  await payload.create({ collection: 'users', data: SEED_USER })

  await payload.create({
    collection: 'pages',
    locale: 'fr',
    data: {
      title: 'Bonjour le monde',
      slug: 'bonjour-le-monde',
      summary: 'Un résumé court.',
      url: 'https://example.test/bonjour',
    },
  })
}
