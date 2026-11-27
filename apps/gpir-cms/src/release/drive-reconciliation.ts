import { createHash } from 'node:crypto'
import type { DriveReview } from './drive-intake'

export type DriveEditorialAnnotation = {
  id: string
  size: number
  mime: string
  editorial: Omit<DriveReview, 'menuPath' | 'sourceFileId' | 'sourceFileName' | 'reconciliationHash'>
}

export type DriveReconciliationRow = {
  reference: string
  menu: string[]
  categoryStatus: string
  useCase: string
  filename: string
  sha256: string
  bytes: number
  note?: string
}

export type DriveCandidate = { id: string; name: string; mimeType: string; size: number; hash: string }

export type ReconciledDriveCandidate = {
  candidate: DriveCandidate
  disposition: 'ELIGIBLE' | 'HELD_EXCEPTION' | 'EXCLUDED_UNMATCHED'
  reason: string
  review?: DriveReview
}

const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const digest = /^[a-f0-9]{64}$/
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function reconcileDriveCandidates(
  candidates: DriveCandidate[],
  annotations: DriveEditorialAnnotation[],
  rows: DriveReconciliationRow[],
): ReconciledDriveCandidate[] {
  if (!Array.isArray(candidates) || !Array.isArray(annotations) || !Array.isArray(rows)) throw new Error('DRIVE_RECONCILIATION_INVALID')
  const candidateIds = new Set(candidates.map(item => item.id))
  const candidateHashes = new Set(candidates.map(item => item.hash))
  const annotationIds = new Set(annotations.map(item => item.id))
  const annotationHashes = new Set(annotations.map(item => item.editorial?.hash))
  const rowHashes = new Set(rows.map(item => item.sha256))
  if (candidateIds.size !== candidates.length || candidateHashes.size !== candidates.length ||
      annotationIds.size !== annotations.length || annotationHashes.size !== annotations.length ||
      rowHashes.size !== rows.length) throw new Error('DRIVE_RECONCILIATION_DUPLICATED')
  const annotationByHash = new Map(annotations.map(item => [item.editorial.hash, item]))
  const rowByHash = new Map(rows.map(item => [item.sha256, item]))
  return candidates.map(candidate => {
    const row = rowByHash.get(candidate.hash)
    if (!row) return { candidate, disposition: 'EXCLUDED_UNMATCHED', reason: 'NOT_IN_APPROVED_DISTRIBUTION_MATRIX' }
    const menuPath = Array.isArray(row.menu) && row.menu.every(item => typeof item === 'string')
      ? row.menu.map(item => item.trim()) : []
    if (menuPath.length === 3 && menuPath[2] === '') menuPath.pop()
    if (!digest.test(row.sha256) || row.bytes !== candidate.size || row.filename !== candidate.name ||
        ![2, 3].includes(menuPath.length) || menuPath.some(item => !item) ||
        typeof row.reference !== 'string' || !row.reference.trim() || typeof row.useCase !== 'string' || !row.useCase.trim()) {
      throw new Error('DRIVE_RECONCILIATION_ROW_MISMATCH')
    }
    if (typeof row.note === 'string' && /third-party origin|despite singapore filename/i.test(row.note)) {
      return { candidate, disposition: 'HELD_EXCEPTION', reason: row.note.trim() }
    }
    const annotation = annotationByHash.get(candidate.hash)
    if (!annotation || annotation.id !== candidate.id || annotation.size !== candidate.size || annotation.mime !== candidate.mimeType ||
        annotation.editorial.hash !== candidate.hash || !slug.test(annotation.editorial.chapterSlug) ||
        !slug.test(annotation.editorial.routeSlug) || !annotation.editorial.title?.trim() ||
        !annotation.editorial.summary?.trim() || !annotation.editorial.body?.trim() ||
        annotation.editorial.category !== row.useCase) throw new Error('DRIVE_EDITORIAL_ANNOTATION_MISMATCH')
    const reconciliationHash = sha256({ row, editorial: annotation.editorial })
    return {
      candidate,
      disposition: 'ELIGIBLE',
      reason: 'APPROVED_HASH_BOUND_EDITORIAL_MAPPING',
      review: {
        ...annotation.editorial,
        menuPath,
        sourceFileId: candidate.id,
        sourceFileName: candidate.name,
        reconciliationHash,
      },
    }
  })
}
