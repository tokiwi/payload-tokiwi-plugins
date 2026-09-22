import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { RenderBlocks } from '@/blocks/RenderBlocks'

// Everything on this page comes from the database, which no build step has access to.
export const dynamic = 'force-dynamic'

const PageView = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'pages',
    limit: 1,
    where: { slug: { equals: slug } },
  })

  const page = docs[0]
  if (!page) {
    notFound()
  }

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-semibold">{page.title}</h1>
      <RenderBlocks blocks={page.layout} />
    </main>
  )
}

export default PageView
