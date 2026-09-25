/**
 * Translating a list-view selection in one request.
 *
 * The selection arrives as a Payload `Where`, which is how the admin already
 * describes both "these five rows" (`id: { in: [...] }`) and "everything matching
 * the current filters": `useSelection().getQueryParams()` builds one or the other,
 * and this never has to tell them apart.
 *
 * Documents are translated one at a time, sharing a single deadline, so a long
 * run degrades into a partial result that names exactly which documents were
 * reached. Re-running finishes the rest, and with "overwrite" off the finished
 * ones cost nothing the second time.
 */

import type { CollectionSlug, PayloadRequest, SelectType, Where } from 'payload'

import type { DeeplClient } from './deepl'
import type { BulkDocumentResult, BulkTranslateResult, ResolvedPluginConfig } from './types'

import { DeeplError } from './deepl'
import { translateDocument } from './translateDocument'

export type TranslateDocumentsArgs = {
  collection: string
  config: ResolvedPluginConfig
  createClient?: () => DeeplClient
  now?: () => number
  /**
   * Called as each document finishes, before the next one starts. The endpoint
   * uses it to stream a line per document so the admin can draw a progress bar on
   * a run whose length nothing bounds up front.
   */
  onProgress?: (event: { document: BulkDocumentResult; index: number; total: number }) => void
  overwrite: boolean
  req: PayloadRequest
  sourceLocale: string
  targetLocale: string
  where: Where
}

/**
 * Thrown when a selection exceeds an explicitly configured `maxDocuments`. There
 * is no cap by default. This exists so a project that wants one gets a clear
 * refusal rather than a silently truncated run.
 */
export class TooManyDocumentsError extends Error {
  constructor(
    readonly found: number,
    readonly max: number,
  ) {
    super(`Selected ${found} documents. This translates at most ${max} at a time.`)
    this.name = 'TooManyDocumentsError'
  }
}

export const translateDocuments = async ({
  collection,
  config,
  createClient,
  now = Date.now,
  onProgress,
  overwrite,
  req,
  sourceLocale,
  targetLocale,
  where,
}: TranslateDocumentsArgs): Promise<BulkTranslateResult> => {
  const { payload, user } = req

  const useAsTitle = payload.collections[collection as CollectionSlug]?.config.admin?.useAsTitle

  // Only the id and the title column are needed to drive the run, and a selection
  // is unbounded, so the rest of every document stays out of memory.
  const select = { id: true, ...(useAsTitle ? { [useAsTitle]: true } : {}) } as SelectType

  const found = await payload.find({
    collection: collection as CollectionSlug,
    depth: 0,
    // One extra when a cap is configured, so an oversized selection can be
    // reported precisely rather than silently truncated.
    ...(config.maxDocuments > 0 ? { limit: config.maxDocuments + 1 } : {}),
    overrideAccess: false,
    pagination: false,
    req,
    select,
    sort: 'id',
    user,
    where,
  })

  if (config.maxDocuments > 0 && found.docs.length > config.maxDocuments) {
    throw new TooManyDocumentsError(found.docs.length, config.maxDocuments)
  }

  const total = found.docs.length

  const deadline = now() + config.bulkBudgetMs
  const results: BulkDocumentResult[] = []
  let partial = false
  let translated = 0

  /** Records one document's outcome and tells the caller, in that order. */
  const record = (document: BulkDocumentResult): void => {
    results.push(document)
    onProgress?.({ document, index: results.length - 1, total })
  }

  for (const doc of found.docs as unknown as Record<string, unknown>[]) {
    const id = doc.id as number | string
    const title = useAsTitle && typeof doc[useAsTitle] === 'string' ? doc[useAsTitle] : undefined

    if (now() > deadline) {
      partial = true
      record({
        error: 'Ran out of time before this document.',
        id,
        ok: false,
        skipped: 0,
        title,
        translated: 0,
      })
      continue
    }

    try {
      const result = await translateDocument({
        collection,
        config,
        createClient,
        deadline,
        id,
        now,
        overwrite,
        req,
        sourceLocale,
        targetLocale,
      })

      translated += result.translated
      if (result.partial) partial = true
      record({
        error: result.ok ? undefined : (result.failures[0]?.reason ?? 'Translation failed.'),
        id,
        ok: result.ok,
        skipped: result.skipped,
        title,
        translated: result.translated,
      })
    } catch (error) {
      // A bad key or an exhausted quota will fail every remaining document the
      // same way, so stop rather than burn the rest of the request on it.
      const fatal = error instanceof DeeplError && error.fatal
      record({
        error: error instanceof Error ? error.message : 'Translation failed.',
        id,
        ok: false,
        skipped: 0,
        title,
        translated: 0,
      })
      if (fatal) {
        partial = true
        break
      }
    }
  }

  const documentsTranslated = results.filter((result) => result.ok).length

  return {
    documentsFailed: results.length - documentsTranslated,
    documentsTranslated,
    // Some documents failing is still a useful outcome. None succeeding is not.
    ok: documentsTranslated > 0 || results.length === 0,
    partial,
    requested: total,
    results,
    sourceLocale,
    targetLocale,
    translated,
  }
}
