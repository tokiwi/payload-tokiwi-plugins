import type { Block, Config } from 'payload'

export type TokiwiBlocksMainOptions = {
  /**
   * Blocks to register, already configured.
   *
   * @example tokiwiBlocksMain({ blocks: [imageCarousel()] })
   */
  blocks: Block[]
  /**
   * Leave the config untouched without removing the plugin from it.
   * @default false
   */
  disabled?: boolean
}

/**
 * Registers blocks in `config.blocks`, Payload's root block registry.
 *
 * Registering is what lets a collection write `blockReferences: ['imageCarousel']` instead
 * of repeating the definition: the block is sanitized once, shares one generated
 * interface, and its slug joins the typed `BlockSlug` union.
 *
 * A `blocks` field uses `blockReferences` **or** `blocks`, never both — Payload throws
 * during sanitization if both are non-empty. With references, write `blocks: []`.
 *
 * @example
 * // payload.config.ts
 * plugins: [tokiwiBlocksMain({ blocks: [imageCarousel()] })]
 *
 * // any collection
 * { name: 'layout', type: 'blocks', blocks: [], blockReferences: ['imageCarousel'] }
 */
export const tokiwiBlocksMain =
  (options: TokiwiBlocksMainOptions) =>
  (config: Config): Config => {
    if (options.disabled) {
      return config
    }

    if (!Array.isArray(options.blocks) || options.blocks.length === 0) {
      throw new Error('[tokiwiBlocksMain] `blocks` must hold at least one block.')
    }

    const registered = [...(config.blocks || [])]

    for (const block of options.blocks) {
      if (registered.some((existing) => existing.slug === block.slug)) {
        console.warn(
          `[tokiwiBlocksMain] A block with the slug "${block.slug}" is already registered — skipping.`,
        )
        continue
      }

      registered.push(block)
    }

    return {
      ...config,
      blocks: registered,
    }
  }
