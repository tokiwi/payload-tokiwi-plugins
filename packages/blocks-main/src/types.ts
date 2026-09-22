import type { Field } from 'payload'

/**
 * The single escape hatch every block in this package exposes.
 *
 * A block ships a fixed, minimal schema and hands it to the project, which returns the
 * schema it actually wants — appending, reordering or replacing fields. This is the whole
 * configuration surface on purpose: an options object covering every field of every block
 * would be larger than the schemas it configures, and would still not fit the next
 * project.
 */
export type BlockOptions = {
  /**
   * @example
   * imageCarousel({ fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields] })
   */
  fields?: (defaultFields: Field[]) => Field[]
}
