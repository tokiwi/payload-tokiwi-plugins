/**
 * Slug normalisation, and recognising a slug nobody chose.
 *
 * DeepL answers a slug with prose: `about-us/management` comes back as
 * `à-propos-de-nous/équipe-de-direction`. `/` is preserved, because on a
 * collection whose slug is a URL path it is the segment separator.
 */

/**
 * Lowercase, unaccented, `a-z0-9` and single dashes, with `/` kept as a separator
 * and empty segments dropped. A value made only of slashes is a root path and
 * stays `/`.
 */
export const slugifyPath = (input: string): string => {
  const segment = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const trimmed = input.trim()
  const segments = trimmed.split('/').map(segment).filter(Boolean)
  if (segments.length > 0) return segments.join('/')
  return /^\/+$/.test(trimmed) ? '/' : ''
}

/**
 * A slug a migration generated to satisfy a `required, unique` constraint. It
 * reads as "already set" to the database, so preserving it would leave the
 * translated page on a meaningless URL.
 */
export const DEFAULT_PLACEHOLDER_SLUG = /^untitled(-\d+)?$/i

export const isPlaceholderSlug = (
  slug: unknown,
  pattern: RegExp = DEFAULT_PLACEHOLDER_SLUG,
): boolean => {
  if (typeof slug !== 'string') return true
  const trimmed = slug.trim()
  if (!trimmed) return true
  // A path is a placeholder only if its last segment is one: `about-us/untitled-4`
  // is still a slug somebody's structure put there.
  const last = trimmed.split('/').filter(Boolean).pop() ?? trimmed
  return pattern.test(last)
}
