'use client'

/**
 * Renders the `imageCarousel` block with Mantine, the stack our projects ship.
 *
 * This file is a copy. Edit it, rename it, throw it away — nothing in the package reads
 * it back, and the block keeps working without it.
 */

import { Carousel } from '@mantine/carousel'
import { Image, Stack, Title } from '@mantine/core'

type Media = {
  alt?: string | null
  url?: string | null
}

type ImageCarouselBlock = {
  // Absent from the shipped schema: a project that wants a heading adds one through the
  // block's `fields` escape hatch, and this renders it when it is there.
  heading?: string | null
  items?: { id?: string | null; media: Media | number | string }[] | null
}

const isPopulated = (media: Media | number | string): media is Media =>
  typeof media === 'object' && media !== null

export function ImageCarousel({ block }: { block: ImageCarouselBlock }) {
  const slides = (block.items ?? []).filter((item) => isPopulated(item.media))

  if (slides.length === 0) {
    return null
  }

  return (
    <Stack gap="md">
      {block.heading && <Title order={2}>{block.heading}</Title>}

      <Carousel
        emblaOptions={{ align: 'start', loop: true }}
        height={300}
        slideGap="md"
        // Slides take the width of the image they hold rather than a fraction of the
        // viewport, so portrait and landscape images sit in the same strip.
        slideSize="0"
        withIndicators
      >
        {slides.map((slide, index) => {
          const media = slide.media as Media

          return (
            <Carousel.Slide key={slide.id ?? index}>
              <Image
                alt={media.alt ?? ''}
                radius="md"
                src={media.url}
                style={{ height: '100%', maxWidth: 'none' }}
                w="auto"
              />
            </Carousel.Slide>
          )
        })}
      </Carousel>
    </Stack>
  )
}
