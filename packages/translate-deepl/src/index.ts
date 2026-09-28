/**
 * Adds a "Translate to new language" action to the document edit view and a
 * "Translate selected" action to the list view. Both fill a document's other
 * locale with a DeepL translation of the one being edited.
 *
 * See `README.md` for the options and for what the plugin deliberately does not do.
 */

import type { CollectionConfig, Config, Field, Plugin } from 'payload'

import type { DeeplLanguagePair, DeeplTranslatePluginConfig, ResolvedPluginConfig } from './types'

import {
  COMPONENT_EXPORT,
  COMPONENT_PATH,
  DEFAULT_BUDGET_MS,
  DEFAULT_BULK_BUDGET_MS,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_SKIP_FIELD_NAMES,
  ENDPOINT_PATH,
  LIST_COMPONENT_EXPORT,
  LIST_COMPONENT_PATH,
  MAX_DEPTH,
} from './constants'
import { buildTranslateEndpoints } from './endpoint'
import { DEFAULT_PLACEHOLDER_SLUG, isPlaceholderSlug, slugifyPath } from './slugify'

export type { DeeplTranslatePluginConfig, TranslateResult } from './types'

/**
 * DeepL rejects a regional variant as `source_lang` but requires one for English
 * targets, so the two directions cannot share a code. Anything beyond the locales
 * this default covers has to come from the `localeMap` option.
 */
const DEFAULT_LOCALE_MAP: Record<string, DeeplLanguagePair> = {
  de: { source: 'DE', target: 'DE' },
  en: { source: 'EN', target: 'EN-GB' },
  es: { source: 'ES', target: 'ES' },
  fr: { source: 'FR', target: 'FR' },
  it: { source: 'IT', target: 'IT' },
  nl: { source: 'NL', target: 'NL' },
  pt: { source: 'PT', target: 'PT-PT' },
}

/**
 * Whether a collection has anything worth translating, walked by hand since this
 * runs before Payload sanitizes the config and `flattenedFields` does not exist
 * yet. Consults the block registry too, since `blockReferences` leaves the
 * inline `blocks` array empty.
 */
const hasLocalizedField = (fields: Field[], blocks: Config['blocks'], depth = 0): boolean => {
  if (depth > MAX_DEPTH) return false

  return fields.some((field) => {
    if ('localized' in field && field.localized) return true

    if (field.type === 'blocks') {
      const inline = field.blocks ?? []
      if (inline.some((block) => hasLocalizedField(block.fields, blocks, depth + 1))) return true
      const referenced = field.blockReferences ?? []
      return referenced.some((reference) => {
        if (typeof reference !== 'string')
          return hasLocalizedField(reference.fields, blocks, depth + 1)
        const block = (blocks ?? []).find((candidate) => candidate.slug === reference)
        return block ? hasLocalizedField(block.fields, blocks, depth + 1) : false
      })
    }

    if (field.type === 'tabs') {
      return field.tabs.some((tab) => hasLocalizedField(tab.fields, blocks, depth + 1))
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      return hasLocalizedField(field.fields, blocks, depth + 1)
    }

    return false
  })
}

const buildPlaceholderTest = (
  placeholder: DeeplTranslatePluginConfig['placeholderSlug'],
): ((slug: unknown) => boolean) => {
  if (typeof placeholder === 'function') {
    return (slug) => typeof slug !== 'string' || !slug.trim() || placeholder(slug)
  }
  const pattern = placeholder ?? DEFAULT_PLACEHOLDER_SLUG
  return (slug) => isPlaceholderSlug(slug, pattern)
}

const resolveConfig = (
  options: DeeplTranslatePluginConfig,
  collections: string[],
): ResolvedPluginConfig => ({
  apiBase: options.apiBase ?? process.env.DEEPL_API_BASE,
  apiKey: options.apiKey ?? process.env.DEEPL_API_KEY,
  budgetMs: options.budgetMs ?? DEFAULT_BUDGET_MS,
  bulkBudgetMs: options.bulkBudgetMs ?? DEFAULT_BULK_BUDGET_MS,
  collections,
  formality: options.formality,
  glossaryId: options.glossaryId,
  isPlaceholderSlug: buildPlaceholderTest(options.placeholderSlug),
  localeMap: { ...DEFAULT_LOCALE_MAP, ...options.localeMap },
  maxDocuments: options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS,
  normalizeSlug: options.normalizeSlug ?? slugifyPath,
  skipFieldNames: new Set([
    ...(options.skipFieldNames ?? DEFAULT_SKIP_FIELD_NAMES),
    ...(options.addSkipFieldNames ?? []),
  ]),
  slugFieldNames: new Set(options.slugFieldNames ?? ['slug']),
  slugMode: options.slugMode ?? 'translate',
})

/**
 * Adds both entry points: the edit view's document controls popup, and the list
 * view's actions menu for a multi-row selection. Existing items are preserved:
 * another plugin may already have put something in either menu.
 */
const withMenuItems = (collection: CollectionConfig): CollectionConfig => {
  const admin = collection.admin ?? {}
  const components = admin.components ?? {}
  const edit = components.edit ?? {}
  const clientProps = { collectionSlug: collection.slug }

  return {
    ...collection,
    admin: {
      ...admin,
      components: {
        ...components,
        edit: {
          ...edit,
          editMenuItems: [
            ...(edit.editMenuItems ?? []),
            { clientProps, exportName: COMPONENT_EXPORT, path: COMPONENT_PATH },
          ],
        },
        listMenuItems: [
          ...(components.listMenuItems ?? []),
          { clientProps, exportName: LIST_COMPONENT_EXPORT, path: LIST_COMPONENT_PATH },
        ],
      },
    },
  }
}

export const deeplTranslatePlugin =
  (options: DeeplTranslatePluginConfig = {}): Plugin =>
  (config: Config): Config => {
    // Nothing to translate between, so the menu item would only be confusing.
    if (options.disabled || !config.localization || config.localization.locales.length < 2) {
      return config
    }

    // Applying the same plugin twice must not register a second menu item or a
    // second copy of each route. A starter that ships a preset plugin list and a
    // project that adds this plugin on top is how that happens.
    const alreadyApplied = (config.endpoints ?? []).some(
      (endpoint) => endpoint.path === ENDPOINT_PATH && endpoint.method === 'post',
    )
    if (alreadyApplied) {
      console.warn(
        '@tokiwi/payload-translate-deepl: the plugin is already registered on this config, so this call is ignored. One instance per config: both would mount the same routes and the first would answer every request.',
      )
      return config
    }

    // Without credentials, the actions are removed rather than left to fail on click.
    const apiBase = options.apiBase ?? process.env.DEEPL_API_BASE
    const apiKey = options.apiKey ?? process.env.DEEPL_API_KEY
    if (!apiBase || !apiKey) {
      console.warn(
        '@tokiwi/payload-translate-deepl: no DEEPL_API_BASE or DEEPL_API_KEY, so the translate actions are not registered.',
      )
      return config
    }

    const candidates = config.collections ?? []
    const enabled = candidates
      .filter((collection) =>
        options.collections
          ? options.collections.includes(collection.slug)
          : hasLocalizedField(collection.fields, config.blocks),
      )
      .map((collection) => collection.slug)

    if (enabled.length === 0) return config

    const resolved = resolveConfig(options, enabled)

    return {
      ...config,
      collections: candidates.map((collection) =>
        enabled.includes(collection.slug) ? withMenuItems(collection) : collection,
      ),
      // Ahead of the existing entries: a consumer whose endpoint list ends in a
      // catch-all would otherwise shadow these two specific paths.
      endpoints: [...buildTranslateEndpoints(resolved), ...(config.endpoints ?? [])],
    }
  }
