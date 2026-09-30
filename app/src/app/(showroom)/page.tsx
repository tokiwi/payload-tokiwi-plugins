import { Container, Stack, Text, Title } from '@mantine/core'
import config from '@payload-config'
import { getPayload } from 'payload'

import { ImageCarousel } from '@templates/blocks-main/imageCarousel/ImageCarousel'

// Reads the database on every request, so building the showroom never needs one.
export const dynamic = 'force-dynamic'

/**
 * Renders the templates the packages ship, from their real files rather than from a copy,
 * so a template that stops compiling cannot be published.
 */
const Page = async () => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'pages', depth: 1, sort: 'createdAt' })

  return (
    <Container py="xl" size="md">
      <Stack gap="xl">
        {docs.map((page) => (
          <Stack gap="md" key={page.id}>
            <Title order={1}>{page.title}</Title>
            {(page.layout ?? []).map((block) => (
              <ImageCarousel block={block} key={block.id} />
            ))}
          </Stack>
        ))}
        {docs.length === 0 ? (
          <Text>Nothing published yet. Add a page in the admin panel.</Text>
        ) : null}
      </Stack>
    </Container>
  )
}

export default Page
