import test from 'node:test'
import assert from 'node:assert/strict'
import { resumeIdentity } from '../../scripts/m41/finish-website.mjs'

const snapshot = 'a'.repeat(64)
const merge = 'b'.repeat(40)
function fixture() {
    return [{ repository: 'krishnan-vishal/krishnan-vishal.github.io', pr: 580, mergeCommit: merge,
        coverage: { status: 'MIGRATED_NOT_CUT_OVER', snapshot }, contentfulWrites: 0,
        contentfulDeleted: 0, contentfulExistingEntriesModified: 0 },
        { source: 'payload', snapshot }, { merged: true, merge_commit_sha: merge }]
}
test('post-merge continuation requires the completed immutable import and exact PR merge', () => {
    assert.equal(resumeIdentity(...fixture()), snapshot)
    for (const change of [args => { args[2].merged = false }, args => { args[2].merge_commit_sha = 'c'.repeat(40) },
        args => { args[0].coverage.status = 'IN_PROGRESS' }, args => { args[1].snapshot = 'c'.repeat(64) },
        args => { args[0].contentfulWrites = 1 }]) {
        const args = fixture(); change(args)
        assert.throws(() => resumeIdentity(...args))
    }
})
