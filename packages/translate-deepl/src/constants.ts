/**
 * Values shared by the plugin's server half, its client components and its tests.
 *
 * Kept in one module with no imports so that the client bundle never pulls in
 * anything from `payload` just to learn an endpoint path.
 */

/** Mounted under Payload's `routes.api`, so the full URL is `/api/translate/deepl/...`. */
export const ENDPOINT_PATH = '/translate/deepl/:collection/:id'

export const BULK_ENDPOINT_PATH = '/translate/deepl/:collection'

export const buildEndpointPath = (collection: string, id: number | string): string =>
  `/translate/deepl/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`

export const buildBulkEndpointPath = (collection: string): string =>
  `/translate/deepl/${encodeURIComponent(collection)}`

/**
 * Admin component paths are the bare package specifier, which is what frees a
 * consumer from installing the package at any particular location. A consumer runs
 * `payload generate:importmap` after installing, and these are the entries it writes.
 */
export const COMPONENT_PATH = '@tokiwi/payload-translate-deepl/client'
export const COMPONENT_EXPORT = 'TranslateMenuItem'

export const LIST_COMPONENT_PATH = '@tokiwi/payload-translate-deepl/client'
export const LIST_COMPONENT_EXPORT = 'TranslateListMenuItem'

/** The DOM id of our `PopupList.Button`, which `styles.scss` keys its flex ordering off. */
export const MENU_ITEM_ID = 'action-translate-locale'

/** No ceiling on how many documents one bulk run accepts: `bulkBudgetMs` is the only stopping condition. */
export const DEFAULT_MAX_DOCUMENTS = 0

/**
 * Overall budget for a bulk run. Generous, since a streaming response keeps the
 * connection busy: an idle proxy timeout does not end it early.
 */
export const DEFAULT_BULK_BUDGET_MS = 1_800_000

/** Text fields that hold a technical value, not prose, and so must never reach DeepL. */
export const DEFAULT_SKIP_FIELD_NAMES = [
  'id',
  'blockName', // editor-only label for a block in the admin sidebar
  'slug', // handled earlier by `slugMode`, listed here only as a fallback
  'anchor', // URL fragment id
  'url',
  'mailto',
  'width',
  'height',
]

/** Block nesting is legitimately deep (section, row, column, alternate, and on). */
export const MAX_DEPTH = 25

/** DeepL accepts at most 50 `text` entries per request. */
export const MAX_TEXTS_PER_REQUEST = 50

/** DeepL caps a request body at roughly 128 KiB. Stay well under it. */
export const MAX_REQUEST_BYTES = 100_000

/** Per-request network timeout. */
export const REQUEST_TIMEOUT_MS = 30_000

/**
 * Overall budget for one translate. Payload's own catch-all route has runtime
 * limits outside our control, so a large page degrades instead of timing out.
 */
export const DEFAULT_BUDGET_MS = 90_000
