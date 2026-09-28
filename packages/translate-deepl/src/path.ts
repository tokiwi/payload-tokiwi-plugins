/**
 * Immutable writes that clone only what they have to.
 *
 * This is not a convenience: with `blocksAsJSON` the whole block tree is rewritten
 * on every locale update, and Payload re-merges the *other* locale row by row by
 * matching `id` (`beforeChange/getExistingRowDoc.js`). Rebuilding a row, even into
 * a deep-equal object with a regenerated `id`, drops the other locale's content
 * inside it. So every object and array off the mutated path is passed through by
 * reference, untouched, and only the spine is cloned.
 */

export type Path = (number | string)[]

/** Dotted form for error messages: `blockBuilder.0.rows.1.title`. */
export const formatPath = (path: Path): string => path.join('.')

export const getAtPath = (root: unknown, path: Path): unknown => {
  let current: unknown = root
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<number | string, unknown>)[key]
  }
  return current
}

/**
 * Returns a copy of `root` with `path` set to `value`, sharing every subtree the
 * path does not run through. Missing intermediate containers are not created:
 * the path always comes from a walk over the same document, so a miss means the
 * caller is out of sync and the write is skipped rather than invented.
 */
export const setAtPath = <T>(root: T, path: Path, value: unknown): T => {
  if (path.length === 0) return value as T
  if (root === null || root === undefined || typeof root !== 'object') return root

  // `path.length === 0` already returned above, so a first element always exists.
  // The cast tells the compiler what the length check already guarantees.
  const [key, ...rest] = path as [number | string, ...Path]
  const container = root as unknown as Record<number | string, unknown>

  if (!(key in container)) return root

  const nextValue = rest.length === 0 ? value : setAtPath(container[key], rest, value)
  if (nextValue === container[key]) return root

  if (Array.isArray(root)) {
    const copy = root.slice() as unknown as Record<number | string, unknown>
    copy[key] = nextValue
    return copy as unknown as T
  }

  return { ...container, [key]: nextValue } as unknown as T
}

/** Applies several writes, sharing the spine between them. */
export const setManyAtPath = <T>(root: T, entries: { path: Path; value: unknown }[]): T =>
  entries.reduce<T>((acc, entry) => setAtPath(acc, entry.path, entry.value), root)

/**
 * Returns a copy of `root` with `path` removed, sharing everything off the path.
 *
 * Removing a key is not the same as setting it to `null`: Payload's `beforeChange`
 * restores the stored target-locale value for a field that is absent from the
 * update payload, whereas an explicit `null` clears it. That difference is what
 * lets `slugMode: 'preserve-or-derive'` keep an existing slug.
 */
export const unsetAtPath = <T>(root: T, path: Path): T => {
  if (path.length === 0) return root
  if (root === null || root === undefined || typeof root !== 'object') return root

  const [key, ...rest] = path as [number | string, ...Path]
  const container = root as unknown as Record<number | string, unknown>
  if (!(key in container)) return root

  if (rest.length > 0) {
    const nextValue = unsetAtPath(container[key], rest)
    if (nextValue === container[key]) return root
    if (Array.isArray(root)) {
      const copy = root.slice() as unknown as Record<number | string, unknown>
      copy[key] = nextValue
      return copy as unknown as T
    }
    return { ...container, [key]: nextValue } as unknown as T
  }

  // Dropping an array element would shift every later index and break the paths
  // still queued behind this one, so an indexed leaf is cleared rather than spliced.
  if (Array.isArray(root)) {
    const copy = root.slice() as unknown as Record<number | string, unknown>
    copy[key] = null
    return copy as unknown as T
  }

  const remaining = { ...container }
  delete remaining[key]
  return remaining as unknown as T
}
