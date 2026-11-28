import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcileDriveCandidates } from '../src/release/drive-reconciliation'
const hash = 'a'.repeat(64)
const candidate = { id: 'approved-file-id', name: 'approved.jpg', mimeType: 'image/jpeg', size: 10, hash }
const annotation = { id: candidate.id, size: 10, mime: candidate.mimeType, editorial: { hash, title: 'Approved', summary: 'Summary', body: 'Body', chapterSlug: 'stablecoins', routeSlug: 'approved', category: 'C2C' } }
const row = { reference: 'Approved', menu: ['Ecosystem', 'Stable Coin & CBDC', ''], categoryStatus: 'Existing', useCase: 'C2C', filename: candidate.name, sha256: hash, bytes: 10 }
test('approved trailing blank is normalized without inventing a category', () => {
  for (const menu of [row.menu, row.menu.slice(0,2), ['Ecosystem','Stable Coin & CBDC','Trade']]) {
    const result = reconcileDriveCandidates([candidate], [annotation], [{ ...row, menu }])[0]
    assert.equal(result.disposition, 'ELIGIBLE')
    assert.deepEqual(result.review?.menuPath, menu.filter(Boolean))
  }
  assert.throws(() => reconcileDriveCandidates([candidate], [annotation], [{ ...row, menu: ['Ecosystem','','Trade'] }]), /DRIVE_RECONCILIATION_ROW_MISMATCH/)
})
