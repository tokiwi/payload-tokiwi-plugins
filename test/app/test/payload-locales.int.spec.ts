import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Payload treats an omitted *or* null `fallbackLocale` as "use the configured
 * one", so a plain read of an untranslated locale returns the source text. Every
 * translation feature in this repository depends on the opposite being asked for
 * explicitly, and nothing fails loudly when it is not. Pinned here, against the
 * peer floor and against latest.
 */
describe('locale reads on this Payload version', () => {
  let payload: Payload
  let id: number | string

  beforeAll(async () => {
    process.env.DATABASE_URI = `file:${path.join(mkdtempSync(path.join(tmpdir(), 'tokiwi-')), 'locales.db')}`
    process.env.PAYLOAD_SECRET = 'int-suite-secret'

    const { getPayload } = await import('payload')
    const config = (await import('../src/payload.config')).default
    payload = await getPayload({ config })

    const created = await payload.create({
      collection: 'pages',
      locale: 'fr',
      data: { title: 'Bonjour', slug: 'bonjour-int', url: 'https://example.test/x' },
    })
    id = created.id
  })

  afterAll(async () => {
    await payload.destroy?.()
  })

  it('returns the source text for an untranslated locale when no fallback is given', async () => {
    const doc = await payload.findByID({ collection: 'pages', id, locale: 'en' })

    expect(doc.title).toBe('Bonjour')
  })

  it('returns nothing for an untranslated locale with fallbackLocale false', async () => {
    const doc = await payload.findByID({
      collection: 'pages',
      id,
      locale: 'en',
      fallbackLocale: false,
    })

    expect(doc.title).toBeFalsy()
  })

  it('keeps a non-localized field identical across locales', async () => {
    const fr = await payload.findByID({ collection: 'pages', id, locale: 'fr' })
    const en = await payload.findByID({
      collection: 'pages',
      id,
      locale: 'en',
      fallbackLocale: false,
    })

    expect(en.url).toBe(fr.url)
  })
})
