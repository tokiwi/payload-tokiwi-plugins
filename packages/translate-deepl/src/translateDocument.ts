/**
 * One translate run: read both locales, send what needs translating to DeepL,
 * write the result into the target locale of the same document.
 *
 * Three details here are load-bearing, and each fails silently if got wrong:
 *
 *  1. Both reads pass `fallbackLocale: false`. Payload treats an omitted *or*
 *     `null` fallback as "use the configured one". A config that leaves
 *     `localization.fallback` at its default `true` therefore fails silently: a
 *     plain read of the English locale hands back the French text for anything
 *     untranslated. Left unfixed, translating en -> fr would send French to DeepL
 *     asking for French and write it back over the real French.
 *
 *  2. `_status` never travels back by accident. Payload computes
 *     `isSavingDraft = draft && hasDrafts && data._status !== 'published'`, so
 *     the *source* document's status would otherwise decide whether the write
 *     publishes. It is stripped with the other server-managed keys and set again
 *     deliberately, for a document that is already published: see the write at
 *     the bottom of the file.
 *
 *  3. The payload is built *from the source document* and edited through
 *     `setAtPath`, which clones only the spine. Block and array rows are matched
 *     back to storage by `id` alone, so a rebuilt row, even a deep-equal one,
 *     drops the other locale's content inside it.
 *
 * Building on the source document also means everything localized but not
 * translatable, a localized select, a number, is carried across to the target
 * locale, which is what an editor expects from "translate this document".
 */

import type { CollectionSlug, PayloadRequest, TypedLocale } from 'payload'

import { ValidationError } from 'payload'

import type { LocalizedLeaf } from './collect'
import type { LexicalGroup } from './lexical'
import type { Path } from './path'
import type { ResolvedPluginConfig, TranslateIssue, TranslateResult } from './types'
import type { TaggedSegment } from './xml'

import { collectLocalizedLeaves } from './collect'
import { batchItems, DeeplClient, DeeplError } from './deepl'
import { applyLexicalStrings, extractLexicalStrings } from './lexical'
import { formatPath, getAtPath, setAtPath, unsetAtPath } from './path'
import { buildTaggedText, parseTaggedText, splitSegment } from './xml'

type Data = Record<string, unknown>

/**
 * Every Local API call this plugin makes carries it, on the reads as on the write.
 * A consumer whose `afterRead` hook decorates documents with computed keys checks
 * for it and stands aside, so nothing it adds is read back and written into the
 * target locale.
 */
export const TRANSLATE_CONTEXT_KEY = 'deeplTranslate'

/** Keys Payload manages itself and that must never travel back into `update()`. */
const STRIPPED_TOP_LEVEL_KEYS = ['_status', 'createdAt', 'id', 'updatedAt']

/** A single string handed to DeepL on its own. */
type PlainJob = {
  apply: (translated: string) => void
  text: string
}

/** A whole block-level run, tag-wrapped so its formatting survives reordering. */
type TaggedJob = {
  apply: (values: string[]) => void
  /** Per-run jobs used when the tag round-trip does not come back intact. */
  fallback: PlainJob[]
  path: string
  segmentCount: number
  text: string
}

/** One rich-text field's groups, filled in as jobs complete. */
type LexicalTask = {
  groups: LexicalGroup[]
  path: Path
  source: unknown
  translated: (null | string[])[]
}

const isEmptyValue = (leaf: LocalizedLeaf, value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (leaf.kind === 'lexical') return extractLexicalStrings(value).length === 0
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * A job for a plain `text` / `textarea` value, which owns its own whitespace:
 * DeepL's answer is trimmed and the source value's leading and trailing runs are
 * put back, so padding it decided to add cannot drift into the stored value.
 *
 * Rich text does *not* go through here: `applyLexicalStrings` reattaches the
 * whitespace per node, and wrapping it twice would double it.
 */
const buildPlainJob = (segment: TaggedSegment, assign: (value: string) => void): PlainJob => ({
  apply: (translated) => assign(`${segment.leading}${translated.trim()}${segment.trailing}`),
  text: segment.core,
})

/** A job whose translation is handed on untouched, for `applyLexicalStrings` to place. */
const buildRawJob = (segment: TaggedSegment, assign: (value: string) => void): PlainJob => ({
  apply: assign,
  text: segment.core,
})

export type TranslateDocumentArgs = {
  collection: string
  config: ResolvedPluginConfig
  /** Injected by the tests. Defaults to a real DeepL client. */
  createClient?: () => DeeplClient
  /**
   * Absolute epoch ms to stop at, overriding `config.budgetMs`. A bulk run shares
   * one deadline across every document so the whole request stays bounded, rather
   * than each document getting a fresh budget.
   */
  deadline?: number
  id: number | string
  /** Wall clock, injectable so the time budget is testable. */
  now?: () => number
  overwrite: boolean
  req: PayloadRequest
  sourceLocale: string
  targetLocale: string
}

export const translateDocument = async ({
  collection,
  config,
  createClient,
  deadline: deadlineArg,
  id,
  now = Date.now,
  overwrite,
  req,
  sourceLocale,
  targetLocale,
}: TranslateDocumentArgs): Promise<TranslateResult> => {
  const { payload, user } = req

  const from = config.localeMap[sourceLocale]
  const to = config.localeMap[targetLocale]
  if (!from)
    throw new DeeplError(`No DeepL language configured for "${sourceLocale}".`, { fatal: true })
  if (!to)
    throw new DeeplError(`No DeepL language configured for "${targetLocale}".`, { fatal: true })

  const read = (locale: string) =>
    payload.findByID({
      collection: collection as CollectionSlug,
      id,
      context: { [TRANSLATE_CONTEXT_KEY]: true },
      depth: 0,
      draft: true,
      fallbackLocale: false, // not `null`, see note 1 above
      locale: locale as TypedLocale,
      overrideAccess: false,
      req,
      trash: true,
      user,
    })

  const source = (await read(sourceLocale)) as unknown as Data
  const target = (await read(targetLocale)) as unknown as Data

  const leaves = collectLocalizedLeaves({
    collectionSlug: collection,
    doc: source,
    payload,
    skipFieldNames: config.skipFieldNames,
  })

  const failures: TranslateIssue[] = []
  const warnings: TranslateIssue[] = []
  const plainJobs: PlainJob[] = []
  const taggedJobs: TaggedJob[] = []
  const lexicalTasks: LexicalTask[] = []
  const writes: { path: Path; value: unknown }[] = []
  const unsets: Path[] = []

  let skipped = 0
  let translated = 0

  for (const leaf of leaves) {
    const targetValue = getAtPath(target, leaf.path)

    if (config.slugFieldNames.has(leaf.name)) {
      // A slug is a live URL, so an editor's own is never rewritten. What the
      // backfill left behind is not an editor's own: `untitled-87` reads as "set"
      // to the database and would otherwise be preserved forever, which is exactly
      // the bug this branch exists to avoid.
      const mayReplace = overwrite || config.isPlaceholderSlug(targetValue)
      if (!mayReplace) {
        writes.push({ path: leaf.path, value: targetValue })
        skipped++
        continue
      }

      // 'copy' leaves the source value already sitting in the payload.
      if (config.slugMode === 'copy') continue

      if (config.slugMode === 'preserve-or-derive') {
        // Drop the key so the collection's own beforeValidate derives one from the
        // freshly translated title.
        unsets.push(leaf.path)
        continue
      }

      const segment = typeof leaf.value === 'string' ? splitSegment(leaf.value) : null
      if (!segment) {
        unsets.push(leaf.path)
        continue
      }
      plainJobs.push({
        // DeepL answers a slug with prose, so the result is normalised here rather
        // than relying on the collection to own a slugifier.
        apply: (value) => {
          const normalized = config.normalizeSlug(value)
          if (!normalized) {
            unsets.push(leaf.path)
            return
          }
          writes.push({ path: leaf.path, value: normalized })
          translated++
        },
        text: segment.core,
      })
      continue
    }

    if (config.skipFieldNames.has(leaf.name)) {
      // A URL, an icon name, an anchor: never translated, and never copied over
      // whatever the target locale already holds.
      if (!isEmptyValue(leaf, targetValue)) writes.push({ path: leaf.path, value: targetValue })
      continue
    }

    if (!overwrite && !isEmptyValue(leaf, targetValue)) {
      writes.push({ path: leaf.path, value: targetValue })
      skipped++
      continue
    }

    // Localized but not text: a select, a number, a date. Copied across with the
    // rest of the source document. There is nothing to send to DeepL.
    if (leaf.kind === 'other') continue

    if (leaf.kind === 'string') {
      if (typeof leaf.value !== 'string') continue
      const segment = splitSegment(leaf.value)
      // Empty, whitespace only, or without a letter ("2024", "—"): the source
      // value is already in place and is the right answer in any language.
      if (!segment) continue
      plainJobs.push(
        buildPlainJob(segment, (value) => {
          writes.push({ path: leaf.path, value })
          translated++
        }),
      )
      continue
    }

    const groups = extractLexicalStrings(leaf.value)
    if (groups.length === 0) continue

    const task: LexicalTask = {
      groups,
      path: leaf.path,
      source: leaf.value,
      translated: groups.map(() => null),
    }
    lexicalTasks.push(task)

    groups.forEach((group, groupIndex) => {
      const assign = (values: string[]) => {
        task.translated[groupIndex] = values
      }

      // A single run needs no tags: no XML to build, nothing to parse, and no way
      // for the round-trip to fail. This is the common case in practice.
      if (group.segments.length === 1) {
        // `length === 1` was just checked, so index 0 exists.
        plainJobs.push(buildRawJob(group.segments[0]!, (value) => assign([value])))
        return
      }

      const perRun: string[] = new Array(group.segments.length).fill('')
      taggedJobs.push({
        apply: assign,
        fallback: group.segments.map((segment, segmentIndex) =>
          buildRawJob(segment, (value) => {
            perRun[segmentIndex] = value
            assign(perRun)
          }),
        ),
        path: `${formatPath(leaf.path)} (${group.segments.length} runs)`,
        segmentCount: group.segments.length,
        text: buildTaggedText(group.segments),
      })
    })
  }

  const client = createClient ? createClient() : buildClient(config)
  const deadline = deadlineArg ?? now() + config.budgetMs
  let partial = false

  const runPlain = async (jobs: PlainJob[]): Promise<void> => {
    for (const batch of batchItems(jobs, (job) => job.text)) {
      if (now() > deadline) {
        partial = true
        return
      }
      const values = await client.translateBatch(
        batch.map((job) => job.text),
        { sourceLang: from.source, targetLang: to.target },
      )
      // `translateBatch` throws unless it returns exactly one value per input text.
      batch.forEach((job, index) => job.apply(values[index]!))
    }
  }

  try {
    // Tagged batches run first: a failed round-trip queues extra plain work, and
    // this order keeps that work inside the same budget.
    const fallbackJobs: PlainJob[] = []
    for (const batch of batchItems(taggedJobs, (job) => job.text)) {
      if (now() > deadline) {
        partial = true
        break
      }
      const values = await client.translateBatch(
        batch.map((job) => job.text),
        { sourceLang: from.source, tagged: true, targetLang: to.target },
      )
      batch.forEach((job, index) => {
        // `translateBatch` throws unless it returns exactly one value per input text.
        const parsed = parseTaggedText(values[index]!, job.segmentCount)
        if (parsed.ok) {
          job.apply(parsed.values)
          return
        }
        warnings.push({
          path: job.path,
          reason: `formatting could not be preserved (${parsed.reason}), translated run by run`,
        })
        fallbackJobs.push(...job.fallback)
      })
    }

    await runPlain([...plainJobs, ...fallbackJobs])
  } catch (error) {
    // A fatal error (bad key, exhausted quota) aborts before anything is written.
    if (error instanceof DeeplError && error.fatal) throw error
    failures.push({
      path: '',
      reason: error instanceof Error ? error.message : 'DeepL request failed',
    })
    partial = true
  }

  for (const task of lexicalTasks) {
    if (task.translated.every((entry) => entry === null)) continue
    writes.push({
      path: task.path,
      value: applyLexicalStrings(task.source, task.groups, task.translated),
    })
    translated++
  }

  if (translated === 0) {
    // Nothing was translated, so there is nothing to save. Writing anyway would
    // copy the source locale over the target verbatim: a silent "copy to locale"
    // that nobody asked for, and the worst possible outcome of a DeepL outage or
    // an exhausted time budget.
    if (partial && failures.length === 0) {
      failures.push({ path: '', reason: 'Ran out of time before DeepL answered.' })
    }
    return {
      charactersBilled: client.charactersBilled || undefined,
      failures,
      ok: failures.length === 0,
      partial,
      published: false,
      skipped,
      sourceLocale,
      targetLocale,
      translated: 0,
      warnings,
    }
  }

  let data = source
  for (const write of writes) data = setAtPath(data, write.path, write.value)
  for (const path of unsets) data = unsetAtPath(data, path)
  for (const key of STRIPPED_TOP_LEVEL_KEYS) data = unsetAtPath(data, [key])

  /**
   * Whether this translation should be published rather than left as a draft.
   *
   * Only a document that is already published: the source locale is on the site,
   * so its translation belongs there too. One that has never been published stays
   * a draft (translating a page must not be the act that puts it on the site),
   * and a collection without drafts has nothing to publish, its write being live
   * the moment it lands.
   *
   * The published state is the one in the main table: a draft save writes a
   * version row and leaves that table alone, so `_status` there answers this in a
   * count, without loading the document again.
   */
  const shouldPublish = async (): Promise<boolean> => {
    const hasDrafts = Boolean(
      payload.collections[collection as CollectionSlug]?.config.versions?.drafts,
    )
    if (!hasDrafts) return false

    const { totalDocs } = await payload.count({
      collection: collection as CollectionSlug,
      overrideAccess: false,
      req,
      trash: true,
      user,
      where: { and: [{ id: { equals: id } }, { _status: { equals: 'published' } }] },
    })
    return totalDocs > 0
  }

  const save = (publish: boolean) =>
    payload.update({
      collection: collection as CollectionSlug,
      id,
      context: { [TRANSLATE_CONTEXT_KEY]: true },
      // `_status` was stripped with the other server-managed keys. Putting it back
      // is what makes this a publish, because `isSavingDraft` is false as soon as
      // it reads 'published'. `publishSpecificLocale` keeps the publish to the
      // target locale: Payload merges the write into the last *published* version
      // for that locale alone, so unpublished work in the source locale stays
      // unpublished and is carried on into a snapshot version.
      data: publish ? { ...data, _status: 'published' } : data,
      depth: 0,
      // A no-op on collections without drafts, where the write is live either way.
      draft: !publish,
      locale: targetLocale as TypedLocale,
      overrideAccess: false,
      ...(publish ? { publishSpecificLocale: targetLocale } : {}),
      req,
      user,
    })

  let published = await shouldPublish()

  if (published) {
    try {
      await save(true)
    } catch (error) {
      // Publishing validates the whole document. A draft write does not, unless
      // the collection turns `drafts.validate` on. A required field the source
      // locale left empty, or a translated slug another document already uses,
      // must not cost the editor the whole run: keep the translation as a draft
      // and say why it is not live.
      if (!(error instanceof ValidationError)) throw error
      published = false
      warnings.push({ path: '', reason: `saved as a draft, not published: ${error.message}` })
      await save(false)
    }
  } else {
    await save(false)
  }

  return {
    charactersBilled: client.charactersBilled || undefined,
    failures,
    ok: true,
    partial,
    published,
    skipped,
    sourceLocale,
    targetLocale,
    translated,
    warnings,
  }
}

const buildClient = (config: ResolvedPluginConfig): DeeplClient => {
  if (!config.apiBase || !config.apiKey) {
    throw new DeeplError('DeepL is not configured: set DEEPL_API_BASE and DEEPL_API_KEY.', {
      fatal: true,
    })
  }
  return new DeeplClient({
    apiBase: config.apiBase,
    apiKey: config.apiKey,
    formality: config.formality,
    glossaryId: config.glossaryId,
  })
}
