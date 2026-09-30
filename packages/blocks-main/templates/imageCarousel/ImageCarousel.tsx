'use client'

import { Carousel } from '@mantine/carousel'
import { Image, Stack, Title } from '@mantine/core'

/**
 * Renders the `imageCarousel` block with Mantine.
 *
 * This file is a copy. Edit it, rename it, delete it: nothing in the package reads it
 * back, and the block keeps working without it. The Mantine stylesheets it needs
 * (`@mantine/core/styles.css`, `@mantine/carousel/styles.css`) are imported by the
 * application, not here.
 */

type Upload = {
  alt?: string | null
  url?: string | null
}

type ImageCarouselBlock = {
  /**
   * Absent from the shipped schema: a project that wants a heading adds one through the
   * block's `fields` escape hatch, and this renders it once it is there.
   */
  heading?: string | null
  slides?: { id?: string | null; image: Upload | number | string }[] | null
}

export function ImageCarousel({ block }: { block: ImageCarouselBlock }) {
  // An upload read at depth 0 comes back as an id, and a slide can outlive the file it
  // pointed at, so anything without a URL is dropped rather than rendered empty.
  const slides = (block.slides ?? []).flatMap((slide, index) => {
    const image = slide.image

    if (typeof image !== 'object' || !image.url) return []

    return [{ alt: image.alt ?? '', key: slide.id ?? index, url: image.url }]
  })

  if (slides.length === 0) return null

  return (
    <Stack gap="md">
      {block.heading ? <Title order={2}>{block.heading}</Title> : null}

      <Carousel
        emblaOptions={{ align: 'start', loop: true }}
        height={320}
        slideGap="md"
        slideSize={{ base: '100%', sm: '50%' }}
        withIndicators
      >
        {slides.map((slide) => (
          <Carousel.Slide key={slide.key}>
            <Image alt={slide.alt} fit="cover" h="100%" radius="md" src={slide.url} />
          </Carousel.Slide>
        ))}
      </Carousel>
    </Stack>
  )
}
