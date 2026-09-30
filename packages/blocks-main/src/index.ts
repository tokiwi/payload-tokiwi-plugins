/**
 * Block schemas only. The admin side is what our projects have in common, the rendering is
 * what diverges, so the front-end components ship as templates under `templates/` and are
 * copied into a project by `payload-blocks-main add`.
 */

export { imageCarousel, IMAGE_CAROUSEL_SLUG } from './blocks/imageCarousel.js'
export { tokiwiBlocksMain } from './plugin.js'
export type { BlocksMainPluginConfig } from './plugin.js'
export type { BlockOptions } from './types.js'
