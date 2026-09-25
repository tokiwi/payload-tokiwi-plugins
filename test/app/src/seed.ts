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
        body: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'text',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Nous utilisons des méthodes ',
                    version: 1,
                  },
                  {
                    type: 'text',
                    detail: 0,
                    format: 1,
                    mode: 'normal',
                    style: '',
                    text: 'bayésiennes',
                    version: 1,
                  },
                  {
                    type: 'text',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: ' au quotidien.',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        sections: [
          {
            blockType: 'callout',
            heading: 'Un encadré',
            text: {
              root: {
                type: 'root',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'Texte imbriqué.',
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    })
  }
}
