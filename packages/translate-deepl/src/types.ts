/**
 * Public option surface and the request/response contract between the admin
 * drawer and the endpoint.
 *
 * This module is imported by the client component, so it must stay free of any
 * runtime import from `payload`.
 */

/**
 * What to put in the target locale's `slug`, when the plugin decides it may write
 * one at all.
 *
 * It may write one when the target slug is empty, when it is a placeholder (see
 * `placeholderSlug`), or when the editor ticked "overwrite". A slug an editor
 * deliberately set is never touched otherwise, it is a live URL.
 */
export type SlugMode =
  /** Send the slug to DeepL, then normalise the answer. Path depth is preserved. */
  | 'translate'
  /**
   * Send nothing. Payload restores the stored target-locale value, and a
   * collection whose own `beforeValidate` derives a slug from the title fills an
   * empty one from the freshly translated title.
   */
  | 'preserve-or-derive'
  /** Copy the source locale's slug verbatim. */
  | 'copy'

/** DeepL language codes for one Payload locale. */
export type DeeplLanguagePair = {
  /** `source_lang`. DeepL rejects regional variants here (`EN`, not `EN-GB`). */
  source: string
  /** `target_lang`. English *requires* a variant (`EN-GB` / `EN-US`). */
  target: string
}

export type DeeplTranslatePluginConfig = {
  /**
   * Keep the plugin registered but inert. Nothing is added to the admin and the
   * endpoint is not mounted.
   */
  disabled?: boolean
  /**
   * Collections that get the menu item. Defaults to every collection whose field
   * tree contains at least one `localized: true` field.
   */
  collections?: string[]
  /** Payload locale code -> DeepL languages. Merged over the built-in defaults. */
  localeMap?: Record<string, DeeplLanguagePair>
  /** Replaces the built-in skip list. Short enough to read, so replacing it is legible. */
  skipFieldNames?: string[]
  /** Added to the list in effect, whether that is the built-in one or a replacement. */
  addSkipFieldNames?: string[]
  /** Default `'translate'`. */
  slugMode?: SlugMode
  /**
   * Recognises a slug a migration generated rather than one an editor chose, so it
   * can be replaced instead of preserved. Default matches `untitled` /
   * `untitled-<n>`. Pass a custom pattern or predicate to change that.
   */
  placeholderSlug?: ((slug: string) => boolean) | RegExp
  /** Normalises a translated slug. Defaults to a lowercase, unaccented, `/`-aware slugifier. */
  normalizeSlug?: (value: string) => string
  /** Field names treated as slugs. Default `['slug']`. */
  slugFieldNames?: string[]
  /** Defaults to `process.env.DEEPL_API_BASE`. */
  apiBase?: string
  /** Defaults to `process.env.DEEPL_API_KEY`. */
  apiKey?: string
  /** DeepL `formality`, for languages that support it. */
  formality?: 'default' | 'less' | 'more' | 'prefer_less' | 'prefer_more'
  /** DeepL `glossary_id`. */
  glossaryId?: string
  /** Overall time budget for one translate, in ms. Default 90_000. */
  budgetMs?: number
  /** Time budget for a whole bulk run, in ms. Default 300_000. */
  bulkBudgetMs?: number
  /** Cap on how many documents one bulk run accepts. `0` (the default) is no cap. */
  maxDocuments?: number
}

/** The options object after defaults have been applied. */
export type ResolvedPluginConfig = Required<
  Pick<DeeplTranslatePluginConfig, 'budgetMs' | 'bulkBudgetMs' | 'maxDocuments' | 'slugMode'>
> & {
  collections: string[]
  isPlaceholderSlug: (slug: unknown) => boolean
  normalizeSlug: (value: string) => string
  slugFieldNames: Set<string>
  localeMap: Record<string, DeeplLanguagePair>
  skipFieldNames: Set<string>
  apiBase?: string
  apiKey?: string
  formality?: DeeplTranslatePluginConfig['formality']
  glossaryId?: string
}

export type TranslateRequestBody = {
  sourceLocale: string
  targetLocale: string
  /** Replace values the target locale already holds. Default `false`. */
  overwrite?: boolean
}

/** A path that could not be translated, reported back to the editor. */
export type TranslateIssue = {
  /** Dotted path with numeric row indices, e.g. `blockBuilder.0.rows.1.title`. */
  path: string
  reason: string
}

/** One document's outcome inside a bulk run. */
export type BulkDocumentResult = {
  /** Present when the document could not be translated at all. */
  error?: string
  id: number | string
  ok: boolean
  skipped: number
  /** A short label for the toast, `useAsTitle` when the collection has one. */
  title?: string
  translated: number
}

/** One line of the bulk endpoint's NDJSON response. */
export type BulkProgressEvent =
  | ({ type: 'done' } & BulkTranslateResult)
  | { document: BulkDocumentResult; index: number; total: number; type: 'document' }
  | { total: number; type: 'start' }

export type BulkTranslateResult = {
  documentsFailed: number
  documentsTranslated: number
  ok: boolean
  /** True when the budget or the document cap stopped the run early. */
  partial: boolean
  /** How many documents the selection resolved to. */
  requested: number
  results: BulkDocumentResult[]
  sourceLocale: string
  targetLocale: string
  /** Total values written across every document. */
  translated: number
}

export type TranslateResult = {
  ok: boolean
  sourceLocale: string
  targetLocale: string
  /** Number of values written. */
  translated: number
  /** Values left alone because the target already had content and `overwrite` was off. */
  skipped: number
  /** Characters DeepL billed, when it reported them. */
  charactersBilled?: number
  /** Values that could not be translated at all. */
  failures: TranslateIssue[]
  /** Values translated with a degraded strategy, e.g. formatting may have shifted. */
  warnings: TranslateIssue[]
  /**
   * True when the target locale was published rather than saved as a draft. Only
   * a document that already had a published version is published. One that never
   * did stays a draft, and a collection without drafts is live either way, so both
   * report `false`.
   */
  published: boolean
  /** True when the time budget cut the run short. */
  partial: boolean
}
