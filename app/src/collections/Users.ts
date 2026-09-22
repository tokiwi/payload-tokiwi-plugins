import type { CollectionConfig } from 'payload'

/** The admin panel needs an auth collection; the showroom needs nothing more from it. */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: true,
  fields: [],
}
