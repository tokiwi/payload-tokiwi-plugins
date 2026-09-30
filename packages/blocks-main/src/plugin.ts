import type { Block, Config } from 'payload'

export type BlocksMainPluginConfig = {
  /**
   * The blocks to register, already configured.
   *
   * @example tokiwiBlocksMain({ blocks: [imageCarousel()] })
   */
  blocks: Block[]
  /**
   * Leave the incoming config untouched without removing the plugin from it.
   *
   * @default false
   */
  disabled?: boolean
}

/**
 * Registers blocks in `config.blocks`, Payload's root block registry, so a collection
 * writes `blockReferences: ['imageCarousel']` instead of repeating the definition: the
 * block is sanitized once, shares one generated interface, and its slug joins the typed
 * `BlockSlug` union.
 *
 * A `blocks` field takes `blockReferences` or `blocks`, never both. With references,
 * write `blocks: []`.
 */
export const tokiwiBlocksMain =
  (options: BlocksMainPluginConfig) =>
  (incomingConfig: Config): Config => {
    if (options.disabled) return incomingConfig

    if (options.blocks.length === 0) {
      throw new Error('[tokiwiBlocksMain] `blocks` must hold at least one block.')
    }

    const blocks = [...(incomingConfig.blocks || [])]

    for (const block of options.blocks) {
      if (blocks.some((registered) => registered.slug === block.slug)) {
        console.warn(
          `[tokiwiBlocksMain] The slug "${block.slug}" is already registered. Skipping it.`,
        )
        continue
      }

      blocks.push(block)
    }

    return { ...incomingConfig, blocks }
  }
