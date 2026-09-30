import type { Field } from 'payload'

/**
 * The single escape hatch every block in this package exposes: it receives the block's
 * default fields and returns the schema the project actually wants.
 *
 * An options object covering every field of every block would be larger than the schemas
 * it configures, and would still not fit the next project.
 */
export type BlockOptions = {
  /**
   * @example
   * imageCarousel({ fields: (defaultFields) => [{ name: 'heading', type: 'text' }, ...defaultFields] })
   */
  fields?: (defaultFields: Field[]) => Field[]
}
