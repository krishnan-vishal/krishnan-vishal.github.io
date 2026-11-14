import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalPath, identityConflicts } from '../src/lib/identity'

test('canonical paths normalize without permitting route escapes or the homepage', () => {
  assert.equal(canonicalPath('/research//payments'), '/research/payments/')
  for (const unsafe of ['/', '//evil.example/x', '/a?x=1', '/a/../b']) assert.throws(() => canonicalPath(unsafe))
})

test('all canonical identity namespaces are checked before import', () => {
  const conflicts = identityConflicts({ gpirPublicationId: 'VK-GPIR-P-1', contentfulEntryId: 'entry-1' }, [
    { id: 'doc-1', gpirPublicationId: 'VK-GPIR-P-1', contentfulEntryId: 'different' },
    { id: 'doc-2', gpirPublicationId: 'different', contentfulEntryId: 'entry-1' },
  ])
  assert.deepEqual(conflicts, [
    'gpirPublicationId=VK-GPIR-P-1 already belongs to doc-1',
    'contentfulEntryId=entry-1 already belongs to doc-2',
  ])
})
