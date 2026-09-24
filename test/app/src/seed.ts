import type { Payload } from 'payload'

export const SEED_USER = { email: 'editor@example.test', password: 'test-password-1234' }

/**
 * Brings an empty database to the single known state every suite starts from.
 * Each row is checked for on its own, so a run interrupted between the two
 * creates is repaired by the next one rather than being mistaken for seeded.
 */
export const seed = async (payload: Payload): Promise<void> => {
  const users = await payload.count({ collection: 'users' })
  if (users.totalDocs === 0) {
    await payload.create({ collection: 'users', data: SEED_USER })
  }

  const pages = await payload.count({ collection: 'pages' })
  if (pages.totalDocs === 0) {
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
}
