import type { CollectionConfig } from 'payload'
import { adminOnly, authenticated } from '../lib/access'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: { useAPIKey: true },
  admin: { useAsTitle: 'email' },
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: authenticated,
    update: ({ req, id }) => Boolean(req.user) && ((req.user as { id?: unknown }).id === id ||
      (req.user as { role?: unknown }).role === 'admin'),
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Reviewer', value: 'reviewer' },
        { label: 'Release service', value: 'release-service' },
      ],
      access: { update: ({ req }) => (req.user as { role?: unknown } | null)?.role === 'admin' },
    },
    { name: 'displayName', type: 'text' },
  ],
}
