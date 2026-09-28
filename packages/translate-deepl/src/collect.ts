/**
 * Finding every localized value in a document, by walking the collection's own
 * field schema.
 *
 * Three decisions are load-bearing. Walk `flattenedFields`, so `row`,
 * `collapsible` and unnamed `tabs` are already merged into their parent and `ui`
 * fields are gone. Resolve a block row's config from the `payload.blocks` registry,
 * because a project declaring blocks through `blockReferences` has an empty inline
 * `blocks: []`. And skip a `blockType` that is no longer in the config instead of
 * throwing, because stale rows survive in stored JSON.
 *
 * It records paths, reports only *localized* fields, and never follows a
 * relationship: a related document is its own document, with its own Translate
 * action.
 */

import type { FlattenedBlock, FlattenedField, Payload } from 'payload'

import type { Path } from './path'

import { MAX_DEPTH } from './constants'

type Data = Record<string, unknown>

/**
 * Structural keys Payload injects into every block and array row, never content.
 * Under a *localized* container the two locales hold different rows, so a row
 * `id` copied from one locale into the other breaks the identity matching that
 * keeps the untranslated locale's content alive. Hard-skipped, not part of the
 * configurable list: no project should be able to switch this off.
 */
const NEVER_REPORTED = new Set(['_uuid', 'blockName', 'blockType', 'id'])

/** What the walker found at one localized path. */
export type LocalizedLeaf = {
  /** `text` and `textarea` (single or `hasMany`), or `richText`. */
  kind: 'lexical' | 'other' | 'string'
  name: string
  path: Path
  /**
   * False when the field holds prose we deliberately never send to DeepL (a slug,
   * a URL, an icon name) or a type that is not text at all. Such a value is still
   * reported, because "does the target locale already have something here?" has to
   * be answered for every localized field, not just the translatable ones.
   */
  translatable: boolean
  /** The value as read at the source locale. */
  value: unknown
}

/** `payload.blocks` is keyed by the generated `BlockSlug` union. */
const blockFromRegistry = (payload: Payload, slug: string): FlattenedBlock | undefined =>
  (payload.blocks as Record<string, FlattenedBlock | undefined>)[slug]

/** `payload.collections` is keyed by the generated `CollectionSlug` union. */
const collectionFields = (payload: Payload, slug: string): FlattenedField[] | undefined =>
  (
    payload.collections as Record<
      string,
      { config: { flattenedFields: FlattenedField[] } } | undefined
    >
  )[slug]?.config.flattenedFields

const asData = (value: unknown): Data | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : null

/**
 * A block referenced by slug through `blockReferences` leaves the inline `blocks`
 * array empty, so the real config has to come from the top-level registry.
 */
const resolveBlock = (
  payload: Payload,
  field: Extract<FlattenedField, { type: 'blocks' }>,
  blockType: unknown,
): FlattenedBlock | undefined => {
  if (typeof blockType !== 'string') return undefined
  return (
    blockFromRegistry(payload, blockType) ?? field.blocks.find((block) => block.slug === blockType)
  )
}

/**
 * Payload's own rule, from `fieldShouldBeLocalized` in `payload/shared`: a field
 * marked `localized` under a parent that is already localized is *not* separately
 * localized, because its value already sits inside the parent's per-locale bucket.
 * The flag has to be threaded down the recursion, not read per field.
 */
const isEffectivelyLocalized = (field: FlattenedField, parentIsLocalized: boolean): boolean =>
  parentIsLocalized || ('localized' in field && Boolean(field.localized))

const walk = (
  payload: Payload,
  fields: FlattenedField[],
  data: Data,
  parentIsLocalized: boolean,
  path: Path,
  skipFieldNames: Set<string>,
  out: LocalizedLeaf[],
  depth: number,
): void => {
  if (depth > MAX_DEPTH) return

  for (const field of fields) {
    if (!('name' in field) || !field.name) continue

    // A key the document does not carry at all: there is nothing to translate and
    // nothing to copy. A key holding `null` *is* reported. This is what a read
    // with `fallbackLocale: false` returns for an untranslated localized value,
    // and the caller still has to decide what the target locale should end up with.
    if (NEVER_REPORTED.has(field.name)) continue
    if (!(field.name in data) || data[field.name] === undefined) continue

    const value = data[field.name]
    const fieldPath: Path = [...path, field.name]
    const localized = isEffectivelyLocalized(field, parentIsLocalized)
    // Note `field.localized`, not `isEffectivelyLocalized`. Matching Payload, a
    // localized container makes its whole subtree per-locale even though its
    // children are not individually localized.
    const childParentIsLocalized =
      parentIsLocalized || ('localized' in field && Boolean(field.localized))

    switch (field.type) {
      // Containers are always descended, localized or not: a container like
      // `Pages.blockBuilder` need not be localized for the leaves inside it to be.
      case 'array': {
        if (!Array.isArray(value)) break
        for (let index = 0; index < value.length; index++) {
          const row = asData(value[index])
          if (row) {
            walk(
              payload,
              field.flattenedFields,
              row,
              childParentIsLocalized,
              [...fieldPath, index],
              skipFieldNames,
              out,
              depth + 1,
            )
          }
        }
        break
      }

      case 'blocks': {
        if (!Array.isArray(value)) break
        for (let index = 0; index < value.length; index++) {
          const row = asData(value[index])
          if (!row) continue
          const block = resolveBlock(payload, field, row.blockType)
          if (!block) continue
          walk(
            payload,
            block.flattenedFields,
            row,
            childParentIsLocalized,
            [...fieldPath, index],
            skipFieldNames,
            out,
            depth + 1,
          )
        }
        break
      }

      case 'group':
      case 'tab': {
        const group = asData(value)
        if (group) {
          walk(
            payload,
            field.flattenedFields,
            group,
            childParentIsLocalized,
            fieldPath,
            skipFieldNames,
            out,
            depth + 1,
          )
        }
        break
      }

      case 'richText': {
        if (!localized) break
        out.push({
          kind: 'lexical',
          name: field.name,
          path: fieldPath,
          translatable: !skipFieldNames.has(field.name),
          value,
        })
        break
      }

      case 'text':
      case 'textarea': {
        if (!localized) break
        const translatable = !skipFieldNames.has(field.name)
        if (Array.isArray(value)) {
          // `hasMany` text stores an array of strings. Each entry is its own path.
          for (let index = 0; index < value.length; index++) {
            if (typeof value[index] !== 'string') continue
            out.push({
              kind: 'string',
              name: field.name,
              path: [...fieldPath, index],
              translatable,
              value: value[index],
            })
          }
        } else {
          out.push({ kind: 'string', name: field.name, path: fieldPath, translatable, value })
        }
        break
      }

      default: {
        // Selects, numbers, dates, relationships, uploads, json: never translated,
        // but a localized one still has to be reported so the caller can decide
        // whether the target locale's value should win.
        if (localized) {
          out.push({
            kind: 'other',
            name: field.name,
            path: fieldPath,
            translatable: false,
            value,
          })
        }
        break
      }
    }
  }
}

/**
 * Every localized value in `doc`, in field order, deepest-last within each branch.
 *
 * Exported separately from the orchestration so it can be tested against fixture
 * schemas without a database.
 */
export const collectLocalizedLeaves = ({
  collectionSlug,
  doc,
  payload,
  skipFieldNames,
}: {
  collectionSlug: string
  doc: Data
  payload: Payload
  skipFieldNames: Set<string>
}): LocalizedLeaf[] => {
  const fields = collectionFields(payload, collectionSlug)
  if (!fields) return []

  const out: LocalizedLeaf[] = []
  walk(payload, fields, doc, false, [], skipFieldNames, out, 0)
  return out
}
