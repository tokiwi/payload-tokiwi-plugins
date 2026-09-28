import type { Config, Plugin } from 'payload'

import { deeplTranslatePlugin } from '@tokiwi/payload-translate-deepl'
import type { DeeplTranslatePluginConfig, TranslateResult } from '@tokiwi/payload-translate-deepl'
import { describe, expect, test } from 'tstyche'

describe('deeplTranslatePlugin', () => {
  test('takes no argument, and returns a config transformer', () => {
    expect(deeplTranslatePlugin()).type.toBe<Plugin>()
    expect(deeplTranslatePlugin({})).type.toBe<Plugin>()
    expect(deeplTranslatePlugin()({} as Config)).type.toBe<Config | Promise<Config>>()
  })

  test('accepts every documented option', () => {
    expect(deeplTranslatePlugin).type.toBeCallableWith({
      addSkipFieldNames: ['reference'],
      apiBase: 'https://api-free.deepl.com',
      apiKey: 'key:fx',
      budgetMs: 1,
      bulkBudgetMs: 1,
      collections: ['pages'],
      disabled: false,
      formality: 'more',
      glossaryId: 'g',
      localeMap: { rm: { source: 'RM', target: 'RM' } },
      maxDocuments: 10,
      normalizeSlug: (value: string) => value,
      placeholderSlug: /^untitled$/,
      skipFieldNames: ['id'],
      slugFieldNames: ['slug'],
      slugMode: 'copy',
    })
  })

  test('rejects an unknown option and a misspelled slug mode', () => {
    expect(deeplTranslatePlugin).type.not.toBeCallableWith({ skipFields: ['id'] })
    expect(deeplTranslatePlugin).type.not.toBeCallableWith({ slugMode: 'translated' })
  })
})

describe('the exported types', () => {
  test('DeeplTranslatePluginConfig leaves every option optional', () => {
    expect<DeeplTranslatePluginConfig>().type.toBeAssignableWith({})
  })

  test('TranslateResult reports what was written and what was not', () => {
    expect<TranslateResult>().type.toHaveProperty('translated')
    expect<TranslateResult>().type.toHaveProperty('skipped')
    expect<TranslateResult>().type.toHaveProperty('published')
    expect<TranslateResult>().type.toHaveProperty('partial')
  })
})
