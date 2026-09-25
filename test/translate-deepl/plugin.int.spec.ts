import type { Config } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { DeeplTranslatePluginConfig } from '@tokiwi/payload-translate-deepl'

import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'

// Imports the package by name, so this exercises the exports map and the built
// dist a consumer resolves, not the source. A relative import into packages/
// would hide exactly the failures this suite exists for.

const credentials = { apiBase: 'https://api-free.deepl.com', apiKey: 'key:fx' }

const pages = {
  fields: [{ localized: true, name: 'title', type: 'text' }],
  slug: 'pages',
} as unknown as NonNullable<Config['collections']>[number]

const baseConfig = (extra: Partial<Config> = {}): Config =>
  ({
    collections: [pages],
    localization: { defaultLocale: 'fr', locales: ['fr', 'en'] },
    ...extra,
  }) as Config

const apply = async (options: DeeplTranslatePluginConfig, config: Config): Promise<Config> =>
  await deeplTranslatePlugin(options)(config)

describe('the config transformer', () => {
  it('is idempotent: applying it twice registers one menu item, not two', async () => {
    const once = await apply(credentials, baseConfig())
    const twice = await apply(credentials, once)

    expect(twice.collections?.[0]?.admin?.components?.edit?.editMenuItems).toHaveLength(1)
  })

  it('is a strict no-op when disabled, down to the object identity', async () => {
    const config = baseConfig()
    expect(await apply({ ...credentials, disabled: true }, config)).toBe(config)
  })

  it('preserves endpoints the consumer already registered, and goes ahead of them', async () => {
    const existing = { handler: () => new Response(), method: 'get', path: '/:anything' }
    const next = await apply(
      credentials,
      baseConfig({ endpoints: [existing] } as unknown as Partial<Config>),
    )

    expect(next.endpoints).toHaveLength(3)
    expect(next.endpoints?.[2]).toBe(existing)
    expect(next.endpoints?.[0]?.path).toBe('/translate/deepl/:collection/:id')
    expect(next.endpoints?.[1]?.path).toBe('/translate/deepl/:collection')
  })

  it('preserves collections it does not enable', async () => {
    const other = {
      fields: [{ name: 'key', type: 'text' }],
      slug: 'settings',
    } as unknown as typeof pages
    const next = await apply(credentials, baseConfig({ collections: [pages, other] }))

    expect(next.collections).toHaveLength(2)
    expect(next.collections?.[1]).toBe(other)
  })

  it('registers the components under the bare package specifier', async () => {
    const next = await apply(credentials, baseConfig())
    const edit = next.collections?.[0]?.admin?.components?.edit?.editMenuItems?.[0]
    const list = next.collections?.[0]?.admin?.components?.listMenuItems?.[0]

    // This is what frees a consumer from installing the package anywhere in
    // particular, and what `payload generate:importmap` writes into its import map.
    expect(edit).toMatchObject({
      exportName: 'TranslateMenuItem',
      path: '@tokiwi/payload-translate-deepl/client',
    })
    expect(list).toMatchObject({
      exportName: 'TranslateListMenuItem',
      path: '@tokiwi/payload-translate-deepl/client',
    })
  })
})

describe('removing itself', () => {
  it('does nothing to a config with no localization', async () => {
    const config = { collections: [pages] } as Config
    expect(await apply(credentials, config)).toBe(config)
  })

  it('does nothing when there is only one locale to translate between', async () => {
    const config = baseConfig({
      localization: { defaultLocale: 'fr', locales: ['fr'] },
    } as unknown as Partial<Config>)

    expect(await apply(credentials, config)).toBe(config)
  })

  it('does nothing, and warns once, when the credentials are missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete process.env.DEEPL_API_BASE
    delete process.env.DEEPL_API_KEY
    const config = baseConfig()

    expect(await apply({}, config)).toBe(config)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('options', () => {
  it('reads the credentials from the environment when none are passed', async () => {
    process.env.DEEPL_API_BASE = 'https://api-free.deepl.com'
    process.env.DEEPL_API_KEY = 'key:fx'
    const next = await apply({}, baseConfig())

    expect(next.collections?.[0]?.admin?.components?.edit?.editMenuItems).toHaveLength(1)
    delete process.env.DEEPL_API_BASE
    delete process.env.DEEPL_API_KEY
  })

  it('enables nothing when the collections list names none of them', async () => {
    const config = baseConfig()
    expect(await apply({ ...credentials, collections: [] }, config)).toBe(config)
  })
})
