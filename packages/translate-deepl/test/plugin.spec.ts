import type { CollectionConfig, Config } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeeplTranslatePluginConfig } from '../src/types'

import { deeplTranslatePlugin } from '../src/index'

// The transformer runs before Payload sanitizes the config, so `flattenedFields`
// does not exist yet and the raw `fields` tree is what it has to walk. Every
// fixture here is therefore a raw config, not a sanitized one.

const localization = { defaultLocale: 'fr', locales: ['fr', 'en'] } as Config['localization']

const collection = (slug: string, fields: CollectionConfig['fields']): CollectionConfig =>
  ({ fields, slug }) as CollectionConfig

const build = (collections: CollectionConfig[], extra: Partial<Config> = {}): Config =>
  ({ collections, localization, ...extra }) as Config

const credentials = { apiBase: 'https://api-free.deepl.com', apiKey: 'key:fx' }

const apply = async (options: DeeplTranslatePluginConfig, config: Config): Promise<Config> =>
  await deeplTranslatePlugin(options)(config)

const menuItems = (config: Config, slug: string) =>
  config.collections?.find((entry) => entry.slug === slug)?.admin?.components?.edit?.editMenuItems

const callArgs = (spy: { mock: { calls: unknown[][] } }, index = 0) => spy.mock.calls[index]![0]

describe('choosing collections', () => {
  it('enables a collection whose localized field is nested in a block reference', async () => {
    const config = build(
      [
        collection('pages', [
          { blockReferences: ['callout'], blocks: [], name: 'sections', type: 'blocks' },
        ] as unknown as CollectionConfig['fields']),
      ],
      {
        blocks: [{ fields: [{ localized: true, name: 'heading', type: 'text' }], slug: 'callout' }],
      } as unknown as Partial<Config>,
    )

    expect(menuItems(await apply(credentials, config), 'pages')).toHaveLength(1)
  })

  it('enables a collection whose localized field is inside a tab', async () => {
    const config = build([
      collection('pages', [
        {
          tabs: [{ fields: [{ localized: true, name: 'title', type: 'text' }], label: 'Content' }],
          type: 'tabs',
        },
      ] as unknown as CollectionConfig['fields']),
    ])

    expect(menuItems(await apply(credentials, config), 'pages')).toHaveLength(1)
  })

  it('leaves a collection with no localized field alone', async () => {
    const config = build([
      collection('settings', [{ name: 'key', type: 'text' }] as CollectionConfig['fields']),
    ])
    const next = await apply(credentials, config)

    expect(menuItems(next, 'settings')).toBeUndefined()
    expect(next.endpoints).toBeUndefined()
  })

  it('honours an explicit collections list over the field walk', async () => {
    const config = build([
      collection('pages', [
        { localized: true, name: 'title', type: 'text' },
      ] as CollectionConfig['fields']),
      collection('media', [
        { localized: true, name: 'alt', type: 'text' },
      ] as CollectionConfig['fields']),
    ])
    const next = await apply({ ...credentials, collections: ['media'] }, config)

    expect(menuItems(next, 'pages')).toBeUndefined()
    expect(menuItems(next, 'media')).toHaveLength(1)
  })

  it('preserves menu items another plugin already registered', async () => {
    const config = build([
      {
        ...collection('pages', [
          { localized: true, name: 'title', type: 'text' },
        ] as CollectionConfig['fields']),
        admin: {
          components: {
            edit: { editMenuItems: [{ path: 'other#Item' }] },
            listMenuItems: [{ path: 'other#ListItem' }],
          },
        },
      } as CollectionConfig,
    ])
    const next = await apply(credentials, config)
    const pages = next.collections?.find((entry) => entry.slug === 'pages')

    expect(pages?.admin?.components?.edit?.editMenuItems).toHaveLength(2)
    expect(pages?.admin?.components?.listMenuItems).toHaveLength(2)
  })

  it('is idempotent: a second application changes nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = build([
      collection('pages', [
        { localized: true, name: 'title', type: 'text' },
      ] as CollectionConfig['fields']),
    ])
    const once = await apply(credentials, config)
    const twice = await apply(credentials, once)

    expect(twice).toBe(once)
    expect(menuItems(twice, 'pages')).toHaveLength(1)
    expect(twice.endpoints).toHaveLength(2)
    warn.mockRestore()
  })

  it('warns when a second application is ignored, rather than dropping it silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = build([
      collection('pages', [
        { localized: true, name: 'title', type: 'text' },
      ] as CollectionConfig['fields']),
    ])
    const once = await apply(credentials, config)

    expect(await apply({ ...credentials, collections: ['posts'] }, once)).toBe(once)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('already registered')
    warn.mockRestore()
  })
})

describe('missing credentials', () => {
  beforeEach(() => {
    delete process.env.DEEPL_API_BASE
    delete process.env.DEEPL_API_KEY
  })

  it('removes itself and says so, rather than offering an action that can only fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = build([
      collection('pages', [
        { localized: true, name: 'title', type: 'text' },
      ] as CollectionConfig['fields']),
    ])

    expect(await apply({}, config)).toBe(config)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(callArgs(warn)).toContain('DEEPL_API_KEY')
    warn.mockRestore()
  })

  it('says nothing when the plugin was disabled on purpose', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = build([
      collection('pages', [
        { localized: true, name: 'title', type: 'text' },
      ] as CollectionConfig['fields']),
    ])

    expect(await apply({ disabled: true }, config)).toBe(config)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
