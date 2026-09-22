import config from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'

// Everything on this page comes from the database, which no build step has access to.
export const dynamic = 'force-dynamic'

const Home = async () => {
  const payload = await getPayload({ config })
  const { docs: pages } = await payload.find({ collection: 'pages', limit: 100, sort: 'title' })

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Showroom</h1>
        <p className="text-neutral-600">
          Every Tokiwi Payload package, wired into one application and rendered with the templates
          it ships. Build a page in the{' '}
          <Link className="underline" href="/admin">
            admin panel
          </Link>{' '}
          to see a block here.
        </p>
      </header>

      {pages.length > 0 ? (
        <ul className="space-y-1">
          {pages.map((page) => (
            <li key={page.id}>
              <Link className="underline" href={`/${page.slug}`}>
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-600">No page yet.</p>
      )}
    </main>
  )
}

export default Home
