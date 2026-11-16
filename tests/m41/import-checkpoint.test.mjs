import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import checkpoint from '../../scripts/m41/import-checkpoint.cjs'
const plan = { schema: 'gpir-import-plan/v1', sourceCommit: 'a'.repeat(40), snapshot: 'b'.repeat(64), deliveryDigest: 'c'.repeat(64),
    counts: { blobs: 835, archives: 7, entries: 112, editorial: 112, manifest: 1 } }
const legacy = { phase: 'RECONCILING_CONTENT', sourceCommit: plan.sourceCommit, snapshot: plan.snapshot,
    totalBlobs: 835, created: 100, reconciled: 675 }

test('owner saved 775-operation checkpoint resumes at blob 775 without replaying that prefix', async () => {
    const cursor = checkpoint.initialize(plan, null, legacy)
    assert.equal(cursor.index, 775)
    const visits = [], saves = []
    const result = await checkpoint.runBatch(plan, cursor, async (phase, index) => {
        visits.push([phase, index]); return { disposition: 'created', key: `${phase}:${index}`, bytes: 100 }
    }, next => saves.push(structuredClone(next)))
    assert.equal(visits.length, 25)
    assert.deepEqual(visits[0], ['blobs', 775])
    assert.deepEqual(visits.at(-1), ['blobs', 799])
    assert.equal(result.cursor.index, 800)
    assert.equal(saves.length, 25)
    assert.equal(cursor.index, 775)
})

test('durable cursor wins over legacy progress and rejects changed source, digest and incomplete completion claims', () => {
    const cursor = checkpoint.initialize(plan, null, legacy)
    assert.deepEqual(checkpoint.initialize(plan, cursor, { ...legacy, created: 0 }), cursor)
    assert.throws(() => checkpoint.initialize({ ...plan, snapshot: 'd'.repeat(64) }, cursor))
    assert.throws(() => checkpoint.initialize(plan, { ...cursor, phase: 'complete', index: 0 }))
    for (const change of [{ sourceCommit: 'e'.repeat(40) }, { totalBlobs: 900 }, { reconciled: 900 }, { phase: 'COMPLETE' }]) {
        assert.throws(() => checkpoint.initialize(plan, null, { ...legacy, ...change }))
    }
})

const small = { ...plan, counts: { blobs: 2, archives: 1, entries: 1, editorial: 1, manifest: 1 } }
test('all phases retain their order and the manifest is the final verified operation', async () => {
    let cursor = checkpoint.initialize(small)
    const order = []
    while (cursor.phase !== 'complete') {
        const result = await checkpoint.runBatch(small, cursor, async (phase, index) => {
            order.push(phase); return { disposition: 'created', key: `${phase}:${index}`, bytes: 10 }
        }, () => {}, { maxTasks: 2 })
        cursor = result.cursor
        if (cursor.phase !== 'complete') assert.notEqual(order.at(-1), 'manifest')
    }
    assert.deepEqual(order, ['blobs', 'blobs', 'archives', 'entries', 'editorial', 'manifest'])
    assert.equal(cursor.created, 6)
})

test('interruption after a database commit reuses only the uncertain operation without duplicate writes', async () => {
    const database = new Map()
    let durable = checkpoint.initialize(small), saves = 0, creates = 0
    const perform = async (phase, index) => {
        const key = `${phase}:${index}`
        if (database.has(key)) return { disposition: 'reconciled', key, bytes: 10 }
        database.set(key, true); creates++
        return { disposition: 'created', key, bytes: 10 }
    }
    await assert.rejects(checkpoint.runBatch(small, durable, perform, next => {
        if (++saves === 2) throw Error('fixture-external-interruption')
        durable = structuredClone(next)
    }), /external-interruption/)
    assert.equal(durable.index, 1)
    const resumed = await checkpoint.runBatch(small, durable, perform, next => { durable = structuredClone(next) })
    assert.equal(resumed.cursor.phase, 'complete')
    assert.equal(database.size, 6)
    assert.equal(creates, 6)
    assert.equal(resumed.cursor.reconciled, 1)
})

test('batch limits bound operations and bytes, and unverified outcomes never advance the cursor', async () => {
    const cursor = checkpoint.initialize(small)
    let calls = 0
    const result = await checkpoint.runBatch(small, cursor, async (phase, index) => {
        calls++; return { disposition: 'created', key: `${phase}:${index}`, bytes: 20 }
    }, () => {}, { maxTasks: 25, maxBytes: 10 })
    assert.equal(calls, 1)
    assert.equal(result.cursor.index, 1)
    await assert.rejects(checkpoint.runBatch(small, cursor, async () => ({ disposition: 'skipped', key: 'unknown', bytes: 0 }), () => {}), /verified disposition/)
    assert.equal(cursor.index, 0)
})


test('batch failures retain useful safe categories without returning private diagnostics', () => {
    for (const [error, code] of [
        [{ code: '57014', message: 'fixture-private-query' }, '57014'],
        [{ message: 'Existing Payload content differs; preserve instead of overwriting.' }, 'CONTENT_CONFLICT'],
        [{ message: 'Import plan changed; original cursor and records preserved.' }, 'CHECKPOINT_MISMATCH'],
        [{ message: 'fixture-private-query' }, 'DETAILS_WITHHELD']
    ]) {
        assert.equal(checkpoint.failureCode(error), code)
        assert.equal(checkpoint.failureCode(error).includes('fixture-private'), false)
    }
})


test('an interrupted temporary checkpoint is retained before the next atomic save', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-cursor-fixture-'))
    try {
        const file = path.join(directory, 'cursor.json')
        fs.writeFileSync(file + '.tmp', 'fixture-interrupted-evidence')
        checkpoint.atomic(file, { nextIndex: 775 })
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { nextIndex: 775 })
        const evidence = fs.readdirSync(path.join(directory, 'checkpoints'))
        assert.equal(evidence.length, 1)
        assert.equal(fs.readFileSync(path.join(directory, 'checkpoints', evidence[0]), 'utf8'), 'fixture-interrupted-evidence')
    } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
