import type { Access, FieldAccess, Where } from 'payload'

export type GpirRole = 'admin' | 'editor' | 'reviewer' | 'release-service'

export function roleOf(user: unknown): GpirRole | null {
  if (!user || typeof user !== 'object') return null
  const role = (user as { role?: unknown }).role
  return ['admin', 'editor', 'reviewer', 'release-service'].includes(String(role))
    ? role as GpirRole : null
}

export const authenticated: Access = ({ req }) => Boolean(req.user)
export const editorialRead: Access = ({ req }) => Boolean(roleOf(req.user))
export const editorialWrite: Access = ({ req }) => ['admin', 'editor', 'reviewer'].includes(roleOf(req.user) || '')
export const reviewerWrite: Access = ({ req }) => ['admin', 'reviewer'].includes(roleOf(req.user) || '')
export const reviewerFieldWrite: FieldAccess = ({ req }) => ['admin', 'reviewer'].includes(roleOf(req.user) || '')
export const adminOnly: Access = ({ req }) => roleOf(req.user) === 'admin'
export const never: Access = () => false
export const immutableField: FieldAccess = ({ req }) => roleOf(req.user) === 'admin'

export const releaseRead: Access = ({ req }) => {
  const role = roleOf(req.user)
  if (['admin', 'editor', 'reviewer'].includes(role || '')) return true
  if (role === 'release-service') {
    return {
      and: [
        { _status: { equals: 'published' } },
        { validationStatus: { equals: 'PASS' } },
      ],
    } as Where
  }
  return false
}
