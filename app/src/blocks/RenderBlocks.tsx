import { ImageCarousel } from '@templates/blocks-main/imageCarousel/ImageCarousel'

import type { Page } from '@/payload-types'

type Blocks = NonNullable<Page['layout']>

/**
 * The showroom renders the templates the packages ship, from their real files rather than
 * from a copy, so a template that stops compiling cannot be published.
 */
export const RenderBlocks = ({ blocks }: { blocks?: Blocks | null }) => (
  <>
    {(blocks ?? []).map((block) => {
      switch (block.blockType) {
        case 'imageCarousel':
          return <ImageCarousel key={block.id} block={block} />
      }
    })}
  </>
)
